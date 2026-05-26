"""
Tests for topic lock/unlock logic after the five bug fixes.
Patches `supabase.create_client` before import so no real DB connection is made.
Run with:  python test_lock_logic.py
"""
import asyncio
import os
import sys
from unittest.mock import MagicMock, patch

# Stub env vars so server.py can be imported without real credentials
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "fake_service_key")
os.environ.setdefault("SUPABASE_KEY", "fake_key")
os.environ.setdefault("JWT_SECRET", "fake_secret_32chars_padding_here")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("RAZORPAY_KEY_ID", "fake")
os.environ.setdefault("RAZORPAY_SECRET", "fake")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

# Patch create_client BEFORE importing server so the module-level call is mocked
_mock_sb = MagicMock()
with patch("supabase.create_client", return_value=_mock_sb):
    import server  # noqa: E402

# Replace the module-level supabase with our controllable mock
server.supabase = _mock_sb


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_result(data):
    """Supabase execute() result wrapper."""
    r = MagicMock()
    r.data = data
    return r


def chain(*_args, **_kwargs):
    """Returns a MagicMock that chains .select/.eq/.in_/.order/.execute etc."""
    m = MagicMock()
    m.select.return_value = m
    m.eq.return_value = m
    m.in_.return_value = m
    m.order.return_value = m
    m.limit.return_value = m
    m.single.return_value = m
    return m


def setup_table_mock(table_responses: dict):
    """
    table_responses: { "table_name": <execute_return_value>, ... }
    Each value is passed directly as the return of .execute().
    For tables called multiple times, pass a list -- values are consumed in order.
    """
    call_counts = {}

    def table_side_effect(name):
        m = chain()
        responses = table_responses.get(name, [make_result([])])
        if not isinstance(responses, list):
            responses = [responses]
        idx = call_counts.get(name, 0)
        result = responses[idx % len(responses)]
        call_counts[name] = idx + 1
        m.execute.return_value = result
        # Also make single() return the same mock so .single().execute() works
        m.single.return_value = m
        return m

    _mock_sb.table.side_effect = table_side_effect


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

PASS = 0
FAIL = 0


def assert_eq(label, got, expected):
    global PASS, FAIL
    if got == expected:
        print(f"  PASS  {label}")
        PASS += 1
    else:
        print(f"  FAIL  {label}")
        print(f"        expected: {expected}")
        print(f"        got:      {got}")
        FAIL += 1


async def test_get_ordered_topics_sort():
    """Topics must be sorted by (module.sequence_order, topic.sequence_order)."""
    print("\n[1] get_ordered_topics -- sort order")

    modules = [
        {"id": "m1", "sequence_order": 1},
        {"id": "m2", "sequence_order": 2},
    ]
    topics = [
        {"id": "t2", "module_id": "m1", "sequence_order": 2, "title": "T2"},
        {"id": "t1", "module_id": "m1", "sequence_order": 1, "title": "T1"},
        {"id": "t4", "module_id": "m2", "sequence_order": 2, "title": "T4"},
        {"id": "t3", "module_id": "m2", "sequence_order": 1, "title": "T3"},
    ]

    setup_table_mock({
        "modules": make_result(modules),
        "topics": make_result(topics),
    })

    result = await server.get_ordered_topics("course-1")
    ids = [t["id"] for t in result]
    assert_eq("ordering is t1 t2 t3 t4", ids, ["t1", "t2", "t3", "t4"])


async def test_is_topic_unlocked_first_topic():
    """First topic (idx=0) is always unlocked regardless of batch or progress."""
    print("\n[2] is_topic_unlocked -- first topic always open")

    topic = {"id": "t1", "module_id": "m1", "sequence_order": 1, "title": "T1"}
    module = {"id": "m1", "course_id": "c1"}
    ordered_topics = [topic]

    setup_table_mock({
        "topics": make_result([topic]),
        "modules": make_result([module]),
    })

    # Intercept get_ordered_topics so it returns our controlled list
    orig = server.get_ordered_topics
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t1", batch_id=None)
    assert_eq("(True, None)", result, (True, None))

    server.get_ordered_topics = orig


async def test_is_topic_unlocked_not_in_course():
    """Topic ID not found in ordered list -> (False, seq_locked). Was: falsely (True, None)."""
    print("\n[3] is_topic_unlocked -- topic not in course -> seq_locked (bug fix)")

    topic = {"id": "t-ghost", "module_id": "m1", "sequence_order": 99, "title": "Ghost"}
    module = {"id": "m1", "course_id": "c1"}
    # ordered list does NOT contain t-ghost
    ordered_topics = [{"id": "t1", "module_id": "m1", "sequence_order": 1}]

    setup_table_mock({
        "topics": make_result([topic]),
        "modules": make_result([module]),
    })
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t-ghost", batch_id="batch-1")
    assert_eq("(False, seq_locked)", result, (False, "seq_locked"))

    del server.get_ordered_topics  # restore


async def test_is_topic_unlocked_seq_gate_fails():
    """Second topic: prev topic mandatory subtopics not all complete -> seq_locked."""
    print("\n[4] is_topic_unlocked -- sequential gate blocks (prev mandatory incomplete)")

    topic1 = {"id": "t1", "module_id": "m1", "sequence_order": 1}
    topic2 = {"id": "t2", "module_id": "m1", "sequence_order": 2}
    module = {"id": "m1", "course_id": "c1"}
    ordered_topics = [topic1, topic2]

    # Mandatory subtopics of topic1
    mandatory_subs = [{"id": "s1"}, {"id": "s2"}]
    # Student has only completed s1
    completed = [{"subtopic_id": "s1"}]

    def table_mock(name):
        m = chain()
        if name == "topics":
            m.execute.return_value = make_result([topic2])
        elif name == "modules":
            m.execute.return_value = make_result([module])
        elif name == "subtopics":
            m.execute.return_value = make_result(mandatory_subs)
        elif name == "student_progress":
            m.execute.return_value = make_result(completed)
        else:
            m.execute.return_value = make_result([])
        return m

    _mock_sb.table.side_effect = table_mock
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t2", batch_id="batch-1")
    assert_eq("(False, seq_locked)", result, (False, "seq_locked"))

    del server.get_ordered_topics


async def test_is_topic_unlocked_mentor_gate_no_batch():
    """Seq gate passes but no batch_id -> mentor_locked."""
    print("\n[5] is_topic_unlocked -- seq passes, no batch_id -> mentor_locked")

    topic1 = {"id": "t1", "module_id": "m1", "sequence_order": 1}
    topic2 = {"id": "t2", "module_id": "m1", "sequence_order": 2}
    module = {"id": "m1", "course_id": "c1"}
    ordered_topics = [topic1, topic2]

    mandatory_subs = [{"id": "s1"}]
    completed = [{"subtopic_id": "s1"}]

    def table_mock(name):
        m = chain()
        if name == "topics":
            m.execute.return_value = make_result([topic2])
        elif name == "modules":
            m.execute.return_value = make_result([module])
        elif name == "subtopics":
            m.execute.return_value = make_result(mandatory_subs)
        elif name == "student_progress":
            m.execute.return_value = make_result(completed)
        else:
            m.execute.return_value = make_result([])
        return m

    _mock_sb.table.side_effect = table_mock
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t2", batch_id=None)
    assert_eq("(False, mentor_locked)", result, (False, "mentor_locked"))

    del server.get_ordered_topics


async def test_is_topic_unlocked_mentor_gate_not_unlocked():
    """Seq passes, batch_id present, but mentor hasn't unlocked topic -> mentor_locked."""
    print("\n[6] is_topic_unlocked -- seq passes, batch set, not in batch_topic_access -> mentor_locked")

    topic1 = {"id": "t1", "module_id": "m1", "sequence_order": 1}
    topic2 = {"id": "t2", "module_id": "m1", "sequence_order": 2}
    module = {"id": "m1", "course_id": "c1"}
    ordered_topics = [topic1, topic2]

    mandatory_subs = [{"id": "s1"}]
    completed = [{"subtopic_id": "s1"}]

    def table_mock(name):
        m = chain()
        if name == "topics":
            m.execute.return_value = make_result([topic2])
        elif name == "modules":
            m.execute.return_value = make_result([module])
        elif name == "subtopics":
            m.execute.return_value = make_result(mandatory_subs)
        elif name == "student_progress":
            m.execute.return_value = make_result(completed)
        elif name == "batch_topic_access":
            # Mentor has NOT unlocked t2 -- empty result
            m.execute.return_value = make_result([])
        else:
            m.execute.return_value = make_result([])
        return m

    _mock_sb.table.side_effect = table_mock
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t2", batch_id="batch-1")
    assert_eq("(False, mentor_locked)", result, (False, "mentor_locked"))

    del server.get_ordered_topics


async def test_is_topic_unlocked_both_gates_pass():
    """Seq passes AND mentor has unlocked -> (True, None)."""
    print("\n[7] is_topic_unlocked -- both gates pass -> unlocked")

    topic1 = {"id": "t1", "module_id": "m1", "sequence_order": 1}
    topic2 = {"id": "t2", "module_id": "m1", "sequence_order": 2}
    module = {"id": "m1", "course_id": "c1"}
    ordered_topics = [topic1, topic2]

    mandatory_subs = [{"id": "s1"}]
    completed = [{"subtopic_id": "s1"}]
    mentor_access = [{"id": "access-row-1"}]  # row exists -> mentor unlocked

    def table_mock(name):
        m = chain()
        if name == "topics":
            m.execute.return_value = make_result([topic2])
        elif name == "modules":
            m.execute.return_value = make_result([module])
        elif name == "subtopics":
            m.execute.return_value = make_result(mandatory_subs)
        elif name == "student_progress":
            m.execute.return_value = make_result(completed)
        elif name == "batch_topic_access":
            m.execute.return_value = make_result(mentor_access)
        else:
            m.execute.return_value = make_result([])
        return m

    _mock_sb.table.side_effect = table_mock
    server.get_ordered_topics = AsyncMock(return_value=ordered_topics)

    result = await server.is_topic_unlocked("student-1", "t2", batch_id="batch-1")
    assert_eq("(True, None)", result, (True, None))

    del server.get_ordered_topics


async def test_get_course_uses_same_batch_for_both_gates():
    """
    get_course must use the course-matched batch_id for BOTH tier access AND mentor unlock.
    Previously it used user.get('batch_id') for the mentor gate (wrong batch).
    We verify: a student whose user.batch_id is 'wrong-batch' but whose
    course-matched batch is 'right-batch' sees the correct mentor unlock state.
    """
    print("\n[8] get_course -- course-matched batch used for mentor unlock (not user.batch_id)")

    # Must use real UUID format — server.py validates with uuid.UUID()
    COURSE_ID  = "aaaaaaaa-0000-0000-0000-000000000001"
    MODULE_ID  = "bbbbbbbb-0000-0000-0000-000000000001"
    TOPIC1_ID  = "cccccccc-0000-0000-0000-000000000001"
    TOPIC2_ID  = "cccccccc-0000-0000-0000-000000000002"
    SUB1_ID    = "dddddddd-0000-0000-0000-000000000001"
    SUB2_ID    = "dddddddd-0000-0000-0000-000000000002"
    RIGHT_BATCH = "eeeeeeee-0000-0000-0000-000000000001"
    WRONG_BATCH = "eeeeeeee-0000-0000-0000-000000000002"
    OTHER_COURSE = "aaaaaaaa-0000-0000-0000-000000000099"

    course_id = COURSE_ID

    user = {
        "id": "student-1",
        "role": "student",
        "batch_id": WRONG_BATCH,         # stale / different course batch
        "effective_tier": "full",         # full tier -> skip tier gate
        "access_tier": "full",
    }

    # batch_students: student is in RIGHT_BATCH for this course
    batch_students_data = [
        {"batch_id": RIGHT_BATCH, "batches": {"course_id": COURSE_ID}},
        {"batch_id": WRONG_BATCH, "batches": {"course_id": OTHER_COURSE}},
    ]

    topic1 = {"id": TOPIC1_ID, "module_id": MODULE_ID, "sequence_order": 1, "title": "T1", "tier_locked": False}
    topic2 = {"id": TOPIC2_ID, "module_id": MODULE_ID, "sequence_order": 2, "title": "T2", "tier_locked": False}

    # Mentor has unlocked TOPIC2 for RIGHT_BATCH
    mentor_access = [{"topic_id": TOPIC2_ID}]

    call_state = {"batch_students": 0}

    def table_mock(name):
        m = chain()
        if name == "courses":
            # .single() returns a dict, not a list
            m.execute.return_value = make_result({
                "id": COURSE_ID, "title": "Test Course", "description": "",
                "is_published": True, "status": "published",
                "users": {"name": "Admin"},
            })
        elif name == "modules":
            m.execute.return_value = make_result([
                {"id": MODULE_ID, "course_id": COURSE_ID, "sequence_order": 1, "title": "Module 1"}
            ])
        elif name == "batch_students":
            call_state["batch_students"] += 1
            m.execute.return_value = make_result(batch_students_data)
        elif name == "topics":
            m.execute.return_value = make_result([topic1, topic2])
        elif name == "student_progress":
            # student has completed SUB1 (mandatory subtopic of TOPIC1)
            m.execute.return_value = make_result([
                {"subtopic_id": SUB1_ID, "is_completed": True}
            ])
        elif name == "submissions":
            m.execute.return_value = make_result([])
        elif name == "subtopics":
            m.execute.return_value = make_result([
                {"id": SUB1_ID, "topic_id": TOPIC1_ID, "sequence_order": 1, "is_mandatory": True,
                 "is_published": True, "tasks": []},
                {"id": SUB2_ID, "topic_id": TOPIC2_ID, "sequence_order": 1, "is_mandatory": True,
                 "is_published": True, "tasks": []},
            ])
        elif name == "batch_topic_access":
            m.execute.return_value = make_result(mentor_access)
        else:
            m.execute.return_value = make_result([])
        return m

    _mock_sb.table.side_effect = table_mock

    result = await server.get_course(COURSE_ID, user=user)

    # Find topic2 in result
    topics_flat = [t for m in result["modules"] for t in m.get("topics", [])]
    t2 = next((t for t in topics_flat if t["id"] == TOPIC2_ID), None)

    if t2 is None:
        print("  FAIL  t2 not found in result")
        global FAIL
        FAIL += 1
        return

    # t2 should be unlocked (mentor unlocked it for RIGHT_BATCH)
    # AND seq gate passes (t1's mandatory sub SUB1 is completed in progress_set)
    assert_eq("t2.mentor_locked is False (right-batch was used)", t2.get("mentor_locked"), False)
    assert_eq("t2.unlocked is True (both gates pass)", t2.get("unlocked"), True)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

# Need AsyncMock -- available since Python 3.8
from unittest.mock import AsyncMock  # noqa: E402 (must be after sys.path setup)


async def run_all():
    await test_get_ordered_topics_sort()
    await test_is_topic_unlocked_first_topic()
    await test_is_topic_unlocked_not_in_course()
    await test_is_topic_unlocked_seq_gate_fails()
    await test_is_topic_unlocked_mentor_gate_no_batch()
    await test_is_topic_unlocked_mentor_gate_not_unlocked()
    await test_is_topic_unlocked_both_gates_pass()
    await test_get_course_uses_same_batch_for_both_gates()

    print(f"\n{'='*50}")
    print(f"Results: {PASS} passed, {FAIL} failed")
    print('='*50)
    return FAIL


if __name__ == "__main__":
    failures = asyncio.run(run_all())
    sys.exit(1 if failures else 0)
