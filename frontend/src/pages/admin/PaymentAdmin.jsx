import React, { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import { fmtDateTime } from "../../lib/dateUtils";
import { toast } from "sonner";
import { 
  fetchAdminStudents, 
  recordPayment, 
  fetchPaymentHistory, 
  setBatchModuleAccess, 
  fetchBatchModuleAccess, 
  expireDemosManually 
} from "../../lib/payment";
import { api } from "../../lib/api";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { 
  DollarSign, 
  Settings, 
  Users, 
  History, 
  AlertTriangle, 
  ShieldAlert, 
  Filter,
  CheckCircle,
  Clock,
  Unlock
} from "lucide-react";

export default function PaymentAdmin() {
  const [activeTab, setActiveTab] = useState("students");
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [filterTier, setFilterTier] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  
  // Recording payment state
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentType, setPaymentType] = useState("partial");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // Payment history state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyStudent, setHistoryStudent] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);

  // Batch module config state
  const [selectedConfigBatch, setSelectedConfigBatch] = useState("");
  const [selectedConfigTier, setSelectedConfigTier] = useState("demo");
  const [courseModules, setCourseModules] = useState([]);
  const [allowedModuleIds, setAllowedModuleIds] = useState([]);

  // Load basic data
  useEffect(() => {
    loadStudents();
    loadBatches();
  }, [filterTier, filterBatch]);

  const loadStudents = async () => {
    try {
      const data = await fetchAdminStudents({
        tier: filterTier || undefined,
        batch_id: filterBatch || undefined
      });
      setStudents(data);
    } catch (err) {
      toast.error("Failed to load students list.");
    }
  };

  const loadBatches = async () => {
    try {
      const { data } = await api.get("/admin/batches");
      setBatches(data || []);
    } catch (err) {
      toast.error("Failed to load batches.");
    }
  };

  // When selectedConfigBatch changes, load course modules and existing config
  useEffect(() => {
    if (!selectedConfigBatch) {
      setCourseModules([]);
      setAllowedModuleIds([]);
      return;
    }
    
    const batch = batches.find(b => b.id === selectedConfigBatch);
    if (!batch || !batch.course_id) {
      setCourseModules([]);
      setAllowedModuleIds([]);
      return;
    }

    (async () => {
      try {
        // Load modules for this course
        const resCourse = await api.get(`/courses/${batch.course_id}`);
        setCourseModules(resCourse.data.modules || []);

        // Load allowed modules for this batch & tier
        const resAccess = await fetchBatchModuleAccess(selectedConfigBatch);
        setAllowedModuleIds(resAccess[selectedConfigTier] || []);
      } catch (err) {
        toast.error("Failed to load course modules or access configurations.");
      }
    })();
  }, [selectedConfigBatch, selectedConfigTier, batches]);

  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!paymentAmount || isNaN(paymentAmount) || parseInt(paymentAmount) <= 0) {
      toast.error("Please enter a valid payment amount.");
      return;
    }

    try {
      await recordPayment({
        user_id: selectedStudent.id,
        amount: parseInt(paymentAmount),
        payment_type: paymentType,
        reference_id: paymentRef || null,
        notes: paymentNotes || null
      });

      toast.success("Payment recorded successfully.");
      setShowRecordModal(false);
      // Reset inputs
      setPaymentAmount("");
      setPaymentRef("");
      setPaymentNotes("");
      loadStudents();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to record payment.");
    }
  };

  const handleViewHistory = async (student) => {
    setHistoryStudent(student);
    setShowHistoryModal(true);
    try {
      const history = await fetchPaymentHistory(student.id);
      setPaymentHistory(history);
    } catch (err) {
      toast.error("Failed to load payment history.");
    }
  };

  const handleModuleAccessToggle = (moduleId) => {
    setAllowedModuleIds(prev => 
      prev.includes(moduleId) 
        ? prev.filter(id => id !== moduleId) 
        : [...prev, moduleId]
    );
  };

  const handleSaveModuleAccess = async () => {
    if (!selectedConfigBatch) {
      toast.error("Please select a batch.");
      return;
    }

    try {
      await setBatchModuleAccess(selectedConfigBatch, {
        module_ids: allowedModuleIds,
        tier: selectedConfigTier
      });
      toast.success("Module access configuration saved.");
    } catch (err) {
      toast.error("Failed to save configuration.");
    }
  };

  const handleExpireDemos = async (batchId, batchName) => {
    if (!window.confirm(`Are you sure you want to expire all DEMO students in batch "${batchName}" manually?`)) {
      return;
    }

    try {
      const res = await expireDemosManually(batchId);
      toast.success(`Demo expired manually for ${res.updated_count} student(s) in batch "${batchName}".`);
      loadStudents();
    } catch (err) {
      toast.error("Failed to manual expire demos.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-[#194BFB] selection:text-white pb-12">
      <Navbar />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-5 mb-8">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#0A0A0A] font-sans">PAYMENT & TIER GATE CONTROL</h1>
            <p className="text-slate-500 text-xs mt-1">Manage payment status, student tiers, and batch-level module gating configurations.</p>
          </div>

          {/* Tab Selection */}
          <div className="flex gap-2 mt-4 md:mt-0">
            <Button
              variant={activeTab === "students" ? "default" : "outline"}
              onClick={() => setActiveTab("students")}
              className={`rounded-none uppercase tracking-wider text-[11px] font-bold ${activeTab === "students" ? "bg-[#194BFB] text-white hover:bg-[#153eb3]" : ""}`}
            >
              <Users className="h-3.5 w-3.5 mr-2" />
              Student List
            </Button>
            <Button
              variant={activeTab === "batch-config" ? "default" : "outline"}
              onClick={() => setActiveTab("batch-config")}
              className={`rounded-none uppercase tracking-wider text-[11px] font-bold ${activeTab === "batch-config" ? "bg-[#194BFB] text-white hover:bg-[#153eb3]" : ""}`}
            >
              <Settings className="h-3.5 w-3.5 mr-2" />
              Batch Tier Access
            </Button>
          </div>
        </div>

        {/* Tab Content: Student List */}
        {activeTab === "students" && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="border border-slate-200 bg-white p-4 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                Filters
              </div>

              {/* Tier Filter */}
              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value)}
                className="border border-slate-200 px-3 py-1.5 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none bg-white font-mono"
              >
                <option value="">All Tiers</option>
                <option value="demo">Demo</option>
                <option value="expired">Expired</option>
                <option value="partial">Partial</option>
                <option value="full">Full</option>
              </select>

              {/* Batch Filter */}
              <select
                value={filterBatch}
                onChange={(e) => setFilterBatch(e.target.value)}
                className="border border-slate-200 px-3 py-1.5 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none bg-white font-mono"
              >
                <option value="">All Batches</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Students Table */}
            <div className="border border-slate-200 bg-white overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 font-sans text-xs">
                <thead className="bg-slate-50 font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-4 text-left">Student Info</th>
                    <th className="px-6 py-4 text-left">Batch</th>
                    <th className="px-6 py-4 text-left">Access Tier</th>
                    <th className="px-6 py-4 text-left">Effective Tier</th>
                    <th className="px-6 py-4 text-left">Amount Paid</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-4">
                        <div className="font-bold text-[#0A0A0A]">{student.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{student.email}</div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {student.batch_name}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] border ${
                          student.access_tier === "full" ? "border-green-200 bg-green-50 text-green-700" :
                          student.access_tier === "partial" ? "border-blue-200 bg-blue-50 text-blue-700" :
                          student.access_tier === "expired" ? "border-red-200 bg-red-50 text-red-700" :
                          "border-slate-200 bg-slate-50 text-slate-600"
                        }`}>
                          {student.access_tier}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] border ${
                          student.effective_tier === "full" ? "border-green-200 bg-green-50 text-green-700" :
                          student.effective_tier === "partial" ? "border-blue-200 bg-blue-50 text-blue-700" :
                          student.effective_tier === "expired" ? "border-red-200 bg-red-50 text-red-700" :
                          "border-slate-200 bg-slate-50 text-slate-600"
                        }`}>
                          {student.effective_tier}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-[#0A0A0A]">
                        ₹{(student.amount_paid || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedStudent(student);
                            setPaymentType(student.access_tier === "partial" ? "balance" : "partial");
                            setPaymentAmount(student.access_tier === "partial" ? "6000" : "2500");
                            setShowRecordModal(true);
                          }}
                          className="h-8 rounded-none border-slate-200 text-xs font-semibold hover:border-[#194BFB] hover:text-[#194BFB]"
                        >
                          <DollarSign className="h-3 w-3 mr-1" />
                          Record Payment
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() => handleViewHistory(student)}
                          className="h-8 rounded-none border-slate-200 text-xs font-semibold"
                        >
                          <History className="h-3 w-3 mr-1" />
                          History
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-400">
                        No students found matching current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab Content: Batch Config */}
        {activeTab === "batch-config" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Batch Selection Card */}
            <Card className="lg:col-span-1 p-6 border-slate-200 rounded-none bg-white space-y-6">
              <h2 className="text-sm font-bold tracking-wide uppercase text-slate-800 border-b border-slate-100 pb-3">
                Batch Configurations
              </h2>

              {/* Batch Select */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Select Batch</label>
                <select
                  value={selectedConfigBatch}
                  onChange={(e) => setSelectedConfigBatch(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none bg-white"
                >
                  <option value="">-- Choose Batch --</option>
                  {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Tier Select */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Select Tier Level</label>
                <select
                  value={selectedConfigTier}
                  onChange={(e) => setSelectedConfigTier(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none bg-white font-mono"
                >
                  <option value="demo">Demo Tier</option>
                  <option value="partial">Partial Tier</option>
                </select>
              </div>

              {/* Expire Batch Demos */}
              {selectedConfigBatch && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-[#FF3B30] uppercase tracking-wider mb-2">Danger Actions</h3>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      const b = batches.find(x => x.id === selectedConfigBatch);
                      handleExpireDemos(selectedConfigBatch, b?.name || "");
                    }}
                    className="w-full rounded-none bg-[#FF3B30] hover:bg-[#d93229] font-bold uppercase text-[10px] tracking-wider"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 mr-2" />
                    Force Expire Demos
                  </Button>
                </div>
              )}
            </Card>

            {/* Allowed Modules Checklist Card */}
            <Card className="lg:col-span-2 p-6 border-slate-200 rounded-none bg-white space-y-6">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold tracking-wide uppercase text-slate-800">
                  Permitted Modules Checkbox Settings
                </h2>
                {selectedConfigBatch && (
                  <Button
                    onClick={handleSaveModuleAccess}
                    className="bg-[#194BFB] hover:bg-[#153eb3] text-white text-[11px] font-bold uppercase tracking-wider rounded-none h-8 px-4"
                  >
                    Save Changes
                  </Button>
                )}
              </div>

              {!selectedConfigBatch ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Please select a batch from the sidebar panel to configure its module gates.
                </div>
              ) : courseModules.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  No modules found in the course associated with this batch.
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                  <p className="text-xs text-slate-500 mb-4">
                    Check the modules below that students on the <span className="font-bold font-mono text-[#194BFB] uppercase">{selectedConfigTier}</span> tier should be allowed to view. Unchecked modules will be completely locked and hidden from their syllabus structure.
                  </p>
                  
                  {courseModules.map((m) => {
                    const isChecked = allowedModuleIds.includes(m.id);
                    return (
                      <div 
                        key={m.id}
                        onClick={() => handleModuleAccessToggle(m.id)}
                        className={`border p-4 flex items-center justify-between cursor-pointer transition-all ${
                          isChecked 
                            ? "border-[#194BFB] bg-[#194BFB]/5" 
                            : "border-slate-200 hover:border-slate-300 bg-white"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800 text-sm">
                            {m.title}
                          </div>
                          {m.sequence_order !== undefined && (
                            <div className="text-[10px] font-mono text-slate-400">Order Index: {m.sequence_order}</div>
                          )}
                        </div>

                        <div>
                          {isChecked ? (
                            <span className="inline-flex items-center gap-1.5 border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700 uppercase tracking-wider">
                              <Unlock className="h-3 w-3" />
                              Allowed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Locked
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* MODAL: Record Payment */}
      {showRecordModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md border border-slate-200 bg-white p-6 relative font-sans shadow-2xl">
            {/* Header */}
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-black tracking-wider uppercase text-slate-800">
                Record Payment Verification
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Updating payment tier for student: <span className="font-bold text-slate-700">{selectedStudent.name}</span>
              </p>
            </div>

            <form onSubmit={handleRecordPaymentSubmit} className="space-y-4">
              {/* Payment Type */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Tier Step</label>
                <select
                  value={paymentType}
                  onChange={(e) => {
                    setPaymentType(e.target.value);
                    if (e.target.value === "partial") setPaymentAmount("2500");
                    if (e.target.value === "balance") setPaymentAmount("6000");
                    if (e.target.value === "full") setPaymentAmount("8500");
                  }}
                  className="w-full border border-slate-200 px-3 py-2 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none bg-white"
                >
                  <option value="partial">Partial Payment (₹2,500)</option>
                  <option value="full">Direct Full Payment (₹8,500)</option>
                  <option value="balance">Rework Balance Payment (₹6,000)</option>
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Paid (INR)</label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 2500"
                  className="rounded-none border-slate-200 text-xs h-9 focus-visible:ring-0 focus-visible:border-[#194BFB]"
                  required
                />
              </div>

              {/* Reference ID */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">UPI / Bank Reference UTR</label>
                <Input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="UTR Transaction Reference Number"
                  className="rounded-none border-slate-200 text-xs h-9 focus-visible:ring-0 focus-visible:border-[#194BFB]"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Notes</label>
                <textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="e.g. Paid online, verified screenshot."
                  rows="2"
                  className="w-full border border-slate-200 p-2 text-xs focus:border-[#194BFB] focus:ring-0 rounded-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowRecordModal(false)}
                  className="h-9 rounded-none border-slate-200 text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-9 rounded-none bg-[#194BFB] hover:bg-[#153eb3] text-white text-xs font-bold uppercase tracking-wider px-6"
                >
                  Save Record
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Payment History */}
      {showHistoryModal && historyStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl border border-slate-200 bg-white p-6 relative font-sans shadow-2xl">
            {/* Close Button */}
            <button 
              onClick={() => setShowHistoryModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 font-bold"
            >
              &times;
            </button>

            {/* Header */}
            <div className="border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-black tracking-wider uppercase text-slate-800">
                Payment History Logs
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Payments logged for student: <span className="font-bold text-slate-700">{historyStudent.name}</span> ({historyStudent.email})
              </p>
            </div>

            {/* Table */}
            <div className="max-h-[350px] overflow-y-auto border border-slate-100">
              <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                <thead className="bg-slate-50 font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Type</th>
                    <th className="px-4 py-3 text-left">Amount</th>
                    <th className="px-4 py-3 text-left">Reference UTR</th>
                    <th className="px-4 py-3 text-left">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paymentHistory.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 font-mono">
                      <td className="px-4 py-3 text-slate-500">
                        {fmtDateTime(p.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
                          p.payment_type === "full" ? "border-green-200 bg-green-50 text-green-700" :
                          p.payment_type === "partial" ? "border-blue-200 bg-blue-50 text-blue-700" :
                          "border-orange-200 bg-orange-50 text-orange-700"
                        }`}>
                          {p.payment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-800">
                        ₹{(p.amount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600 truncate max-w-[150px]">
                        {p.reference_id || "-"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {p.recorded_by_name || "Admin"}
                      </td>
                    </tr>
                  ))}
                  {paymentHistory.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-4 py-6 text-center text-slate-400 font-sans">
                        No payments logged for this student yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-3 mt-4 border-t border-slate-100">
              <Button
                onClick={() => setShowHistoryModal(false)}
                className="h-9 rounded-none bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider px-6"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
