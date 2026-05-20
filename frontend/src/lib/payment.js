import { api } from "./api";

export async function fetchPaymentStatus() {
  const res = await api.get("/payment/status");
  return res.data;
}

export async function fetchAccessibleModules() {
  const res = await api.get("/payment/accessible-modules");
  return res.data;
}

export async function recordPayment(payload) {
  const res = await api.post("/admin/payment/record", payload);
  return res.data;
}

export async function fetchAdminStudents(params = {}) {
  const res = await api.get("/admin/payment/students", { params });
  return res.data;
}

export async function fetchPaymentHistory(userId) {
  const res = await api.get(`/admin/payment/history/${userId}`);
  return res.data;
}

export async function setBatchModuleAccess(batchId, payload) {
  const res = await api.post(`/admin/batch/${batchId}/module-access`, payload);
  return res.data;
}

export async function fetchBatchModuleAccess(batchId) {
  const res = await api.get(`/admin/batch/${batchId}/module-access`);
  return res.data;
}

export async function expireDemosManually(batchId) {
  const res = await api.post(`/admin/batch/${batchId}/expire-demos`);
  return res.data;
}

export async function createRazorpayOrder(payload) {
  const res = await api.post("/payment/create-order", payload);
  return res.data;
}

export async function verifyRazorpayPayment(payload) {
  const res = await api.post("/payment/verify", payload);
  return res.data;
}

export async function fetchMyPaymentHistory() {
  const res = await api.get("/payment/history");
  return res.data;
}
