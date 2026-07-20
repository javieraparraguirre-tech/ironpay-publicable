const SUPABASE_URL = "https://pxslwxgthcxiqjbnaznd.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2x3eGd0aGN4aXFqYm5hem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTM4MjQsImV4cCI6MjA5OTAyOTgyNH0.i9NnNhX_Q-1mgGz03n7uw-z_oQee9NmQ8FQAVoOF8Hw";

const supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const today = new Date().toISOString().slice(0, 10);
const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

let state = {
  profile: null,
  settings: null,
  plans: [],
  members: [],
  charges: [],
  payments: [],
  notices: [],
  portalToken: new URLSearchParams(location.search).get("portal"),
  portalData: null,
  monthlyChargesEnsured: false,
  transferNoticeSubmitting: false,
  transferNoticesSent: new Set(),
  lastTransferNoticeCharge: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setDefaultDates();
  bindEvents();

  if (state.portalToken) {
    await ensureMonthlyCharges();
    await loadPortal();
    return;
  }

  const { data } = await supa.auth.getSession();
  if (data.session) await openAdminApp();
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", login);
  $("#memberLoginForm").addEventListener("submit", memberLogin);
  $("#logoutBtn").addEventListener("click", logout);
  $("#planForm").addEventListener("submit", savePlan);
  $("#memberForm").addEventListener("submit", saveMember);
  $("#classForm").addEventListener("submit", saveSingleClass);
  $("#paymentForm").addEventListener("submit", savePayment);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#transferNoticeForm").addEventListener("submit", sendTransferNotice);
  $("#transferCharge").addEventListener("change", () => {
    const selectedCharge = $("#transferCharge").value;
    if (state.transferNoticesSent.has(selectedCharge)) {
      setTransferNoticeMessage("Esta transferencia ya fue informada. Administracion la revisara pronto.", "ok");
    } else {
      setTransferNoticeMessage("");
    }
    updateTransferNoticeControls();
  });
  $("#generateMonthlyBtn").addEventListener("click", generateMonthlyCharges);
  $("#refreshMembersBtn").addEventListener("click", refreshAll);
  $("#refreshChargesBtn").addEventListener("click", refreshAll);
  $("#downloadReportBtn").addEventListener("click", downloadMembersReport);

  $$("[data-login-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.loginTab;
      $$("[data-login-tab]").forEach((item) => item.classList.toggle("active", item === button));
      $("#loginForm").classList.toggle("active", target === "admin");
      $("#memberLoginForm").classList.toggle("active", target === "member");
    });
  });

  $$(".nav").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".nav").forEach((item) => item.classList.toggle("active", item === button));
      $$(".view").forEach((view) => view.classList.toggle("active", view.id === button.dataset.view));
      $("#pageTitle").textContent = button.textContent;
    });
  });

  $("#memberRows").addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy-link]");
    const whatsapp = event.target.closest("[data-whatsapp]");
    const remove = event.target.closest("[data-delete-member]");
    if (copy) await copyMemberLink(copy.dataset.copyLink);
    if (whatsapp) openWhatsapp(whatsapp.dataset.whatsapp);
    if (remove) await deleteMember(remove.dataset.deleteMember);
  });

  $("#planRows").addEventListener("click", async (event) => {
    const remove = event.target.closest("[data-delete-plan]");
    if (remove) await deletePlan(remove.dataset.deletePlan);
  });

  $("#noticeRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-confirm-notice]");
    if (button) await confirmNotice(button.dataset.confirmNotice);
  });

  $("#portalChargeRows").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-report-link-payment]");
    if (button) await reportLinkPayment(button.dataset.reportLinkPayment);
  });
}

async function login(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supa.auth.signInWithPassword({
    email: form.email,
    password: form.password
  });
  if (error) {
    alert("No se pudo entrar. Revisa email, clave o permisos.");
    return;
  }
  await openAdminApp();
}

async function memberLogin(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  await ensureMonthlyCharges();
  const { data, error } = await supa.rpc("get_member_portal_by_identifier", {
    identifier: form.identifier.trim()
  });
  if (error || !data?.ok) {
    alert("No encontre un socio con ese email o telefono.");
    return;
  }
  state.portalData = data;
  state.portalToken = data.member.access_token;
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#memberPortal").classList.remove("hidden");
  renderPortal();
}

async function logout() {
  await supa.auth.signOut();
  $("#app").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
}

async function openAdminApp() {
  const { data: auth } = await supa.auth.getUser();
  const { data: profile } = await supa.from("profiles").select("*").eq("id", auth.user.id).maybeSingle();
  if (!profile || !["admin", "staff"].includes(profile.role)) {
    alert("Tu usuario no tiene permisos de administracion. Promuevelo en Supabase.");
    await supa.auth.signOut();
    return;
  }
  state.profile = profile;
  $("#currentUser").textContent = profile.full_name || profile.email;
  $("#loginScreen").classList.add("hidden");
  $("#memberPortal").classList.add("hidden");
  $("#app").classList.remove("hidden");
  await ensureMonthlyCharges();
  await refreshAll();
}

async function refreshAll() {
  await Promise.all([
    loadSettings(),
    loadPlans(),
    loadMembers(),
    loadCharges(),
    loadPayments(),
    loadNotices()
  ]);
  render();
}

async function loadSettings() {
  const { data, error } = await supa.from("app_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  state.settings = data;
}

async function loadPlans() {
  const { data, error } = await supa.from("plans").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  state.plans = data || [];
}

async function loadMembers() {
  const { data, error } = await supa.from("members").select("*, plans(*)").order("created_at", { ascending: false });
  if (error) throw error;
  state.members = data || [];
}

async function loadCharges() {
  const { data, error } = await supa.from("charge_balances").select("*").order("due_date", { ascending: true });
  if (error) throw error;
  state.charges = data || [];
}

async function loadPayments() {
  const { data, error } = await supa.from("payments").select("*, members(name)").order("paid_at", { ascending: false });
  if (error) throw error;
  state.payments = data || [];
}

async function loadNotices() {
  const { data, error } = await supa.from("payment_notices").select("*, members(name)").order("created_at", { ascending: false });
  if (error) throw error;
  state.notices = data || [];
}

async function savePlan(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supa.from("plans").insert({
    name: form.name.trim(),
    discipline: form.discipline.trim(),
    amount: Number(form.amount)
  });
  if (error) return alert(error.message);
  event.currentTarget.reset();
  await refreshAll();
}

async function saveMember(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supa.from("members").insert({
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim() || null,
    plan_id: form.planId || null
  });
  if (error) return alert(error.message);
  event.currentTarget.reset();
  await ensureMonthlyCharges(true);
  await refreshAll();
}

async function deleteMember(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  const debt = state.charges
    .filter((charge) => charge.member_id === member.id)
    .reduce((total, charge) => total + charge.balance, 0);
  const message = debt > 0
    ? `El socio ${member.name} tiene deuda de ${fmt(debt)}. Si lo eliminas, tambien se eliminaran sus cargos y pagos.`
    : `Se eliminara el socio ${member.name} y su historial asociado.`;
  if (!confirm(`${message}\n\n¿Quieres continuar?`)) return;
  const { error } = await supa.from("members").delete().eq("id", member.id);
  if (error) return alert(error.message);
  await refreshAll();
}

async function deletePlan(planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return;
  const hasMembers = state.members.some((member) => member.plan_id === plan.id);
  if (hasMembers) {
    if (!confirm(`El plan ${plan.name} tiene socios asociados. Se desactivara para nuevos socios, sin borrar los socios existentes.\n\n¿Quieres continuar?`)) return;
    const { error } = await supa.from("plans").update({ active: false }).eq("id", plan.id);
    if (error) return alert(error.message);
  } else {
    if (!confirm(`Se eliminara el plan ${plan.name}.\n\n¿Quieres continuar?`)) return;
    const { error } = await supa.from("plans").delete().eq("id", plan.id);
    if (error) return alert(error.message);
  }
  await refreshAll();
}

async function saveSingleClass(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const charge = {
    member_id: form.memberId,
    kind: "single_class",
    description: form.description.trim(),
    amount: Number(form.amount),
    due_date: form.date,
    period: form.date.slice(0, 7)
  };
  const { data, error } = await supa.from("charges").insert(charge).select().single();
  if (error) return alert(error.message);

  if (form.paymentStatus === "paid") {
    const { error: payError } = await supa.from("payments").insert({
      charge_id: data.id,
      member_id: data.member_id,
      amount: data.amount,
      method: "Pago inmediato",
      paid_at: form.date
    });
    if (payError) return alert(payError.message);
  }

  event.currentTarget.reset();
  setDefaultDates();
  await refreshAll();
}

async function savePayment(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const charge = state.charges.find((item) => item.id === form.chargeId);
  if (!charge) return;
  const { error } = await supa.from("payments").insert({
    charge_id: charge.id,
    member_id: charge.member_id,
    amount: Math.min(Number(form.amount), charge.balance),
    method: form.method,
    paid_at: form.paidAt
  });
  if (error) return alert(error.message);
  event.currentTarget.reset();
  setDefaultDates();
  await refreshAll();
}

async function saveSettings(event) {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const { error } = await supa.from("app_settings").update({
    payment_link_url: form.payment_link_url.trim(),
    monthly_due_day: Math.min(28, Math.max(1, Number(form.monthly_due_day))),
    notification_whatsapp: form.notification_whatsapp.trim(),
    notification_email: form.notification_email.trim(),
    updated_at: new Date().toISOString()
  }).eq("id", 1);
  if (error) return alert(error.message);
  await refreshAll();
  alert("Configuracion guardada.");
}

async function generateMonthlyCharges() {
  const data = await ensureMonthlyCharges(true);
  await refreshAll();
  if (!data) return;
  alert(data.created ? `Se generaron ${data.created} mensualidades.` : "No habia mensualidades nuevas para este mes.");
}

async function ensureMonthlyCharges(force = false) {
  if (state.monthlyChargesEnsured && !force) return null;
  const { data, error } = await supa.rpc("ensure_current_monthly_charges");
  if (error) {
    console.warn("No se pudieron asegurar las mensualidades del mes", error);
    if (force) alert(error.message);
    return null;
  }
  state.monthlyChargesEnsured = true;
  return data;
}

async function confirmNotice(noticeId) {
  const notice = state.notices.find((item) => item.id === noticeId);
  if (!notice || notice.status !== "pending") return;
  const { error: payError } = await supa.from("payments").insert({
    charge_id: notice.charge_id,
    member_id: notice.member_id,
    amount: notice.amount,
    method: "Transferencia informada",
    paid_at: today
  });
  if (payError) return alert(payError.message);

  const { error } = await supa.from("payment_notices").update({
    status: "confirmed",
    confirmed_at: today
  }).eq("id", notice.id);
  if (error) return alert(error.message);
  await refreshAll();
}

async function loadPortal() {
  const { data, error } = await supa.rpc("get_member_portal", { token: state.portalToken });
  if (error || !data?.ok) {
    $("#loginHint").textContent = "Link de socio invalido o expirado.";
    return;
  }
  state.portalData = data;
  $("#loginScreen").classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#memberPortal").classList.remove("hidden");
  renderPortal();
}

async function sendTransferNotice(event) {
  event.preventDefault();
  if (state.transferNoticeSubmitting) return;

  const formElement = event.currentTarget;
  const form = Object.fromEntries(new FormData(event.currentTarget));
  if (!form.chargeId) return;
  if (state.transferNoticesSent.has(form.chargeId)) {
    setTransferNoticeMessage("Esta transferencia ya fue informada. Administracion la revisara pronto.", "ok");
    updateTransferNoticeControls();
    return;
  }

  state.transferNoticeSubmitting = true;
  setTransferNoticeMessage("Enviando aviso de transferencia...", "warn");
  updateTransferNoticeControls();

  try {
    const noticeRequest = supa.rpc("create_payment_notice", {
      token: state.portalToken,
      charge: form.chargeId,
      amount: Number(form.amount),
      reference: form.reference.trim()
    });
    const { data, error } = await Promise.race([
      noticeRequest,
      wait(8000).then(() => ({
        data: {
          ok: true,
          status: "processing_timeout",
          message: "Listo. Tu aviso esta en proceso; no es necesario volver a enviarlo."
        },
        error: null
      }))
    ]);

    if (error || !data?.ok) {
      setTransferNoticeMessage(data?.message || error?.message || "No se pudo informar el pago. Intenta nuevamente.", "bad");
      return;
    }

  state.transferNoticesSent.add(form.chargeId);
  state.lastTransferNoticeCharge = form.chargeId;
  formElement.querySelector("[name='reference']").value = "";
  const notifiedCharge = (state.portalData?.charges || []).find((item) => item.id === form.chargeId);
  const notifiedMember = state.portalData?.member;

  const message = data.status === "already_pending"
    ? "Listo. Esta transferencia ya estaba informada y administracion la revisara pronto."
    : data.status === "processing_timeout"
      ? "Listo. Tu aviso esta en proceso; no es necesario volver a enviarlo."
      : "Listo. Tu transferencia fue informada correctamente y administracion la revisara pronto.";
  setTransferNoticeMessage(message, "ok");
  if (notifiedCharge && notifiedMember) {
    notifyAdminPaymentNotice("Transferencia", notifiedMember, notifiedCharge, form.amount);
  }
  updateTransferNoticeControls();

    loadPortal()
      .then(() => {
        setTransferNoticeMessage(message, "ok");
        updateTransferNoticeControls();
      })
      .catch(() => {
        setTransferNoticeMessage(message, "ok");
        updateTransferNoticeControls();
      });
  } catch (error) {
    setTransferNoticeMessage("No se pudo confirmar el aviso. Revisa tu conexion e intenta nuevamente.", "bad");
  } finally {
    state.transferNoticeSubmitting = false;
    updateTransferNoticeControls();
  }
}

async function reportLinkPayment(chargeId) {
  if (!chargeId || state.transferNoticesSent.has(chargeId)) {
    setLinkPaymentNoticeMessage("Este pago ya fue informado. Administracion lo revisara pronto.", "ok");
    renderPortal();
    return;
  }

  const charge = (state.portalData?.charges || []).find((item) => item.id === chargeId);
  const member = state.portalData?.member;
  if (!charge || !member) return;

  setLinkPaymentNoticeMessage("Informando pago por link...", "warn");
  const { data, error } = await supa.rpc("create_payment_notice", {
    token: state.portalToken,
    charge: charge.id,
    amount: Number(charge.balance || charge.amount || 0),
    reference: "Pago por link informado por socio"
  });

  if (error || !data?.ok) {
    setLinkPaymentNoticeMessage(data?.message || error?.message || "No se pudo informar el pago por link. Intenta nuevamente.", "bad");
    return;
  }

  state.transferNoticesSent.add(charge.id);
  state.lastTransferNoticeCharge = charge.id;
  const message = data.status === "already_pending"
    ? "Listo. Este pago ya estaba informado y administracion lo revisara pronto."
    : "Listo. Tu pago por link fue informado correctamente y administracion lo revisara pronto.";
  setLinkPaymentNoticeMessage(message, "ok");
  notifyAdminPaymentNotice("Pago por link", member, charge, charge.balance || charge.amount);
  renderPortal();
}

function render() {
  syncSelects();
  renderDashboard();
  renderMembers();
  renderPlans();
  renderCharges();
  renderClasses();
  renderPayments();
  renderReports();
  renderSettings();
}

function syncSelects() {
  const plans = state.plans.filter((item) => item.active);
  $("#memberPlan").innerHTML = plans.map((plan) => option(plan.id, `${plan.name} - ${fmt(plan.amount)}`)).join("");
  $("#classMember").innerHTML = state.members.map((member) => option(member.id, member.name)).join("");
  const pending = state.charges.filter((charge) => charge.balance > 0);
  $("#paymentCharge").innerHTML = pending.map((charge) => option(charge.id, `${memberName(charge.member_id)} - ${charge.description} (${fmt(charge.balance)})`)).join("");
  $("#paymentForm [name='amount']").value = pending[0]?.balance || "";
}

function renderDashboard() {
  const paidToday = state.payments.filter((payment) => payment.paid_at === today);
  const paidMonth = state.payments.filter((payment) => payment.paid_at?.slice(0, 7) === today.slice(0, 7));
  const overdue = state.charges.filter((charge) => charge.status === "overdue");
  text("#mToday", fmt(sum(paidToday)));
  text("#mMonth", fmt(sum(paidMonth)));
  text("#mOverdue", fmt(overdue.reduce((total, charge) => total + charge.balance, 0)));
  text("#mMembers", state.members.filter((member) => member.status === "active").length);
  text("#overdueLabel", `${overdue.length} cargos`);
  rows("#overdueRows", overdue, (charge) => `
    <tr><td>${esc(memberName(charge.member_id))}</td><td>${esc(charge.description)}</td><td>${date(charge.due_date)}</td><td class="right">${fmt(charge.balance)}</td></tr>
  `);
}

function renderMembers() {
  rows("#memberRows", state.members, (member) => {
    const debt = state.charges.filter((charge) => charge.member_id === member.id).reduce((total, charge) => total + charge.balance, 0);
    return `<tr>
      <td>${esc(member.name)}</td>
      <td>${esc(member.plans?.name || "Sin plan")}</td>
      <td>${esc(member.phone)}</td>
      <td class="right">${fmt(debt)}</td>
      <td><button class="secondary" data-copy-link="${esc(member.id)}">Copiar link</button></td>
      <td><button class="secondary" data-whatsapp="${esc(member.id)}">WhatsApp</button></td>
      <td><button class="danger" data-delete-member="${esc(member.id)}">Eliminar</button></td>
    </tr>`;
  });
}

function renderPlans() {
  text("#plansLabel", `${state.plans.length} planes`);
  rows("#planRows", state.plans, (plan) => {
    const hasMembers = state.members.some((member) => member.plan_id === plan.id);
    const action = hasMembers ? "Desactivar" : "Eliminar";
    return `<tr>
      <td>${esc(plan.name)}</td>
      <td>${esc(plan.discipline)}</td>
      <td class="right">${fmt(plan.amount)}</td>
      <td>${badge(plan.active ? "Activo" : "Inactivo", plan.active ? "ok" : "warn")}</td>
      <td><button class="danger" data-delete-plan="${esc(plan.id)}">${action}</button></td>
    </tr>`;
  });
}

function renderCharges() {
  const pending = state.charges.filter((charge) => charge.balance > 0);
  text("#chargesLabel", `${pending.length} pendientes`);
  rows("#chargeRows", pending, (charge) => `
    <tr>
      <td>${esc(memberName(charge.member_id))}</td>
      <td>${charge.kind === "monthly" ? "Mensualidad" : "Clase suelta"}</td>
      <td>${esc(charge.description)}</td>
      <td>${date(charge.due_date)}</td>
      <td class="right">${fmt(charge.amount)}</td>
      <td class="right">${fmt(charge.balance)}</td>
      <td>${badge(statusLabel(charge.status), statusClass(charge.status))}</td>
    </tr>
  `);
}

function renderClasses() {
  const classes = state.charges.filter((charge) => charge.kind === "single_class");
  text("#classesLabel", `${classes.length} clases`);
  rows("#classRows", classes, (charge) => `
    <tr><td>${date(charge.due_date)}</td><td>${esc(memberName(charge.member_id))}</td><td>${esc(charge.description)}</td><td class="right">${fmt(charge.amount)}</td><td>${badge(statusLabel(charge.status), statusClass(charge.status))}</td></tr>
  `);
}

function renderPayments() {
  const pending = state.notices.filter((notice) => notice.status === "pending");
  text("#noticesLabel", `${pending.length} pendientes`);
  rows("#noticeRows", state.notices, (notice) => `
    <tr>
      <td>${date(notice.noticed_at)}</td>
      <td>${esc(notice.members?.name || "Socio")}</td>
      <td>${esc(notice.reference || "Sin referencia")}</td>
      <td class="right">${fmt(notice.amount)}</td>
      <td>${badge(notice.status === "confirmed" ? "Confirmada" : "Pendiente", notice.status === "confirmed" ? "ok" : "warn")}</td>
      <td>${notice.status === "pending" ? `<button class="secondary" data-confirm-notice="${esc(notice.id)}">Confirmar</button>` : ""}</td>
    </tr>
  `);
}

function renderReports() {
  const report = membersReport();
  const paid = report.filter((item) => item.paymentStatus === "Al dia");
  const overdue = report.filter((item) => item.paymentStatus !== "Al dia");
  const debt = report.reduce((total, item) => total + item.debt, 0);

  text("#rTotal", report.length);
  text("#rPaid", paid.length);
  text("#rOverdue", overdue.length);
  text("#rDebt", fmt(debt));
  text("#reportLabel", `${report.length} socios`);

  rows("#reportRows", report, (item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${esc(item.plan)}</td>
      <td>${esc(item.phone)}</td>
      <td>${esc(item.email)}</td>
      <td>${badge(item.paymentStatus, item.paymentStatus === "Al dia" ? "ok" : "bad")}</td>
      <td>${esc(item.lastPayment || "Sin pagos")}</td>
      <td class="right">${fmt(item.debt)}</td>
      <td>${badge(item.memberStatus, item.memberStatus === "Activo" ? "ok" : "warn")}</td>
    </tr>
  `);
}

function renderSettings() {
  if (!state.settings) return;
  $("#settingsForm [name='payment_link_url']").value = state.settings.payment_link_url || "";
  $("#settingsForm [name='monthly_due_day']").value = state.settings.monthly_due_day || 3;
  $("#settingsForm [name='notification_whatsapp']").value = state.settings.notification_whatsapp || "";
  $("#settingsForm [name='notification_email']").value = state.settings.notification_email || "";
  $("#settingsTransferBox").innerHTML = transferHtml(state.settings);
}

function renderPortal() {
  const data = state.portalData;
  const member = data.member;
  const charges = data.charges || [];
  const payments = data.payments || [];
  const debt = charges.reduce((total, charge) => total + charge.balance, 0);
  text("#portalMemberName", member.name);
  text("#portalMemberPlan", data.plan ? `${data.plan.name} - ${data.plan.discipline}` : "Sin plan asignado");
  text("#portalDebt", fmt(debt));
  text("#portalChargesLabel", `${charges.length} pendientes`);
  text("#portalPaymentsLabel", fmt(sum(payments)));
  $("#transferBox").innerHTML = transferHtml(data.settings);
  $("#transferCharge").innerHTML = charges.map((charge) => option(charge.id, `${charge.description} - ${fmt(charge.balance)}`)).join("");
  if (state.lastTransferNoticeCharge && charges.some((charge) => charge.id === state.lastTransferNoticeCharge)) {
    $("#transferCharge").value = state.lastTransferNoticeCharge;
  }
  const selectedCharge = charges.find((charge) => charge.id === $("#transferCharge").value) || charges[0];
  $("#transferNoticeForm [name='amount']").value = selectedCharge?.balance || "";
  updateTransferNoticeControls();
  rows("#portalChargeRows", charges, (charge) => `
    <tr>
      <td>${esc(charge.description)}</td>
      <td>${date(charge.due_date)}</td>
      <td class="right">${fmt(charge.balance)}</td>
      <td>
        <button class="secondary" onclick="openPaymentLink('${esc(charge.id)}')">Pagar link</button>
        <button class="secondary" data-report-link-payment="${esc(charge.id)}" ${state.transferNoticesSent.has(charge.id) ? "disabled" : ""}>Ya pague por link</button>
      </td>
    </tr>
  `);
  rows("#portalPaymentRows", payments, (payment) => `
    <tr><td>${date(payment.paid_at)}</td><td>${esc(payment.method)}</td><td class="right">${fmt(payment.amount)}</td></tr>
  `);
}

function updateTransferNoticeControls() {
  const select = $("#transferCharge");
  const button = $("#transferNoticeBtn");
  if (!select || !button) return;
  const selectedCharge = select.value;
  const charge = (state.portalData?.charges || []).find((item) => item.id === selectedCharge);
  const amount = $("#transferNoticeForm [name='amount']");
  if (charge && amount && document.activeElement !== amount) amount.value = charge.balance || "";
  const alreadySent = selectedCharge && state.transferNoticesSent.has(selectedCharge);
  button.disabled = state.transferNoticeSubmitting || alreadySent || !selectedCharge;
  if (state.transferNoticeSubmitting) {
    button.textContent = "Enviando...";
  } else if (alreadySent) {
    button.textContent = "Transferencia informada";
  } else {
    button.textContent = "Informar transferencia";
  }
}

function setTransferNoticeMessage(message, type = "ok") {
  const box = $("#transferNoticeMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `notice ${type}`;
  box.classList.toggle("hidden", !message);
}

function setLinkPaymentNoticeMessage(message, type = "ok") {
  const box = $("#linkPaymentNoticeMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `notice ${type}`;
  box.classList.toggle("hidden", !message);
}

function notifyAdminPaymentNotice(kind, member, charge, amount) {
  const settings = state.portalData?.settings || {};
  const message = [
    `IronPay: ${kind} informado.`,
    `Socio: ${member.name}`,
    `Cargo: ${charge.description}`,
    `Monto: ${fmt(amount)}`,
    "Revisar y confirmar en administracion."
  ].join("\n");
  const phone = whatsappPhone(settings.notification_whatsapp);
  if (phone) {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    return;
  }
  if (settings.notification_email) {
    const subject = encodeURIComponent(`IronPay - ${kind} informado`);
    const body = encodeURIComponent(message);
    window.open(`mailto:${settings.notification_email}?subject=${subject}&body=${body}`, "_blank");
  }
}

function membersReport() {
  return state.members.map((member) => {
    const memberCharges = state.charges.filter((charge) => charge.member_id === member.id);
    const memberPayments = state.payments.filter((payment) => payment.member_id === member.id);
    const debt = memberCharges.reduce((total, charge) => total + Number(charge.balance || 0), 0);
    const hasOverdue = memberCharges.some((charge) => charge.balance > 0 && charge.status === "overdue");
    const lastPayment = memberPayments
      .map((payment) => payment.paid_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      name: member.name,
      plan: member.plans?.name || "Sin plan",
      phone: member.phone || "",
      email: member.email || "",
      paymentStatus: debt <= 0 ? "Al dia" : hasOverdue ? "Moroso" : "Pendiente",
      lastPayment: lastPayment ? date(lastPayment) : "",
      debt,
      memberStatus: member.status === "active" ? "Activo" : "Inactivo"
    };
  });
}

function downloadMembersReport() {
  const report = membersReport();
  const headers = ["Socio", "Plan", "Telefono", "Email", "Estado pago", "Ultimo pago", "Deuda", "Estado socio"];
  const lines = [
    headers,
    ...report.map((item) => [
      item.name,
      item.plan,
      item.phone,
      item.email,
      item.paymentStatus,
      item.lastPayment || "Sin pagos",
      item.debt,
      item.memberStatus
    ])
  ];
  const csv = `sep=;\n${lines.map((line) => line.map(csvCell).join(";")).join("\n")}`;
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reporte-socios-${today}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyMemberLink(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  const link = memberPortalLink(member);
  await navigator.clipboard.writeText(link);
  alert("Link copiado.");
}

function openWhatsapp(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  const debt = state.charges.filter((charge) => charge.member_id === member.id).reduce((total, charge) => total + charge.balance, 0);
  const phone = whatsappPhone(member.phone);
  if (!phone) return alert("Telefono no valido.");
  const message = [
    `Hola ${member.name}, te compartimos tu portal de pago de Iron Gym.`,
    debt > 0 ? `Saldo pendiente: ${fmt(debt)}.` : "Actualmente estas al dia.",
    `Puedes revisar y pagar aqui: ${memberPortalLink(member)}`
  ].join("\n");
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
}

function openPaymentLink(chargeId) {
  const settings = state.portalData?.settings || state.settings;
  if (!settings?.payment_link_url) return alert("No hay link de pago configurado.");
  const params = new URLSearchParams({ cargo: chargeId });
  const separator = settings.payment_link_url.includes("?") ? "&" : "?";
  window.open(`${settings.payment_link_url}${separator}${params.toString()}`, "_blank");
}

window.openPaymentLink = openPaymentLink;

function memberPortalLink(member) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("portal", member.access_token);
  return url.toString();
}

function memberName(memberId) {
  return state.members.find((member) => member.id === memberId)?.name || "Socio";
}

function monthlyDueDate() {
  const dateValue = new Date();
  dateValue.setDate(Math.min(28, Math.max(1, state.settings?.monthly_due_day || 3)));
  return dateValue.toISOString().slice(0, 10);
}

function setDefaultDates() {
  const classDate = $("#classForm [name='date']");
  const paymentDate = $("#paymentForm [name='paidAt']");
  if (classDate) classDate.value = today;
  if (paymentDate) paymentDate.value = today;
}

function transferHtml(settings) {
  return `
    <div><span>Banco</span><strong>${esc(settings.transfer_bank)}</strong></div>
    <div><span>Titular</span><strong>${esc(settings.transfer_holder)}</strong></div>
    <div><span>RUT</span><strong>${esc(settings.transfer_rut)}</strong></div>
    <div><span>Tipo</span><strong>${esc(settings.transfer_account_type)}</strong></div>
    <div><span>Cuenta</span><strong>${esc(settings.transfer_account_number)}</strong></div>
    <div><span>Email</span><strong>${esc(settings.transfer_email)}</strong></div>
  `;
}

function whatsappPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("56")) return digits;
  if (digits.length === 9) return `56${digits}`;
  return digits;
}

function rows(selector, items, template) {
  $(selector).innerHTML = items.length ? items.map(template).join("") : $("#emptyTpl").innerHTML;
}

function option(value, label) {
  return `<option value="${esc(value)}">${esc(label)}</option>`;
}

function text(selector, value) {
  $(selector).textContent = value;
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function fmt(value) {
  return money.format(value || 0);
}

function date(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-CL");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function badge(label, type) {
  return `<span class="badge ${type}">${label}</span>`;
}

function statusLabel(status) {
  return { paid: "Pagado", pending: "Pendiente", overdue: "Vencido" }[status] || status;
}

function statusClass(status) {
  return { paid: "ok", pending: "warn", overdue: "bad" }[status] || "warn";
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
