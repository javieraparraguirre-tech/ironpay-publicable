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
  reportStatusFilter: "all",
  portalToken: new URLSearchParams(location.search).get("portal"),
  portalData: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setDefaultDates();
  bindEvents();

  if (state.portalToken) {
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
  $("#generateMonthlyBtn").addEventListener("click", generateMonthlyCharges);
  $("#refreshMembersBtn").addEventListener("click", refreshAll);
  $("#refreshChargesBtn").addEventListener("click", refreshAll);
  $("#downloadReportBtn").addEventListener("click", downloadMembersReport);
  $("#reportPeriod").addEventListener("change", renderReports);
  $("#reportSearch").addEventListener("input", renderReports);
  $("#memberPeriod").addEventListener("change", renderMembers);
  $("#memberSearch").addEventListener("input", renderMembers);
  $("#cancelMemberEditBtn").addEventListener("click", resetMemberForm);

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
    const edit = event.target.closest("[data-edit-member]");
    const remove = event.target.closest("[data-delete-member]");
    if (copy) await copyMemberLink(copy.dataset.copyLink);
    if (whatsapp) openWhatsapp(whatsapp.dataset.whatsapp);
    if (edit) editMember(edit.dataset.editMember);
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

  $$("[data-report-filter]").forEach((card) => {
    card.addEventListener("click", () => {
      state.reportStatusFilter = card.dataset.reportFilter || "all";
      renderReports();
    });
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
  const memberData = {
    name: form.name.trim(),
    phone: form.phone.trim(),
    email: form.email.trim() || null,
    plan_id: form.planId || null,
    status: form.status || "active"
  };

  if (form.memberId) {
    const previousMember = state.members.find((member) => member.id === form.memberId);
    const { error } = await supa.from("members").update(memberData).eq("id", form.memberId);
    if (error) return alert(error.message);
    if (previousMember?.plan_id !== memberData.plan_id) {
      await updatePendingMemberCharges(form.memberId, memberData.plan_id);
    }
    resetMemberForm();
    await refreshAll();
    return;
  }

  const { error } = await supa.from("members").insert(memberData);
  if (error) return alert(error.message);
  resetMemberForm();
  await refreshAll();
}

async function updatePendingMemberCharges(memberId, planId) {
  const plan = state.plans.find((item) => item.id === planId);
  if (!plan) return;
  const currentPeriod = today.slice(0, 7);
  const editableCharges = state.charges.filter((charge) =>
    charge.member_id === memberId &&
    charge.kind === "monthly" &&
    charge.period >= currentPeriod &&
    Number(charge.paid_amount || 0) === 0
  );

  const results = await Promise.all(editableCharges.map((charge) =>
    supa.from("charges").update({
      description: `Mensualidad ${plan.name}`,
      amount: Number(plan.amount)
    }).eq("id", charge.id)
  ));
  const failed = results.find((result) => result.error);
  if (failed) alert(`El socio se actualizo, pero no pude actualizar un cargo pendiente: ${failed.error.message}`);
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
    notice_whatsapp: form.notice_whatsapp.trim(),
    notice_email: form.notice_email.trim(),
    monthly_due_day: Math.min(28, Math.max(1, Number(form.monthly_due_day))),
    updated_at: new Date().toISOString()
  }).eq("id", 1);
  if (error) return alert(error.message);
  await refreshAll();
  alert("Configuracion guardada.");
}

async function generateMonthlyCharges() {
  if (!state.members.length) return alert("No hay socios activos.");
  const dueDate = monthlyDueDate();
  const period = dueDate.slice(0, 7);
  let created = 0;

  for (const member of state.members.filter((item) => item.status === "active")) {
    const plan = member.plans;
    if (!plan) continue;
    const exists = state.charges.some((charge) => (
      charge.member_id === member.id &&
      charge.kind === "monthly" &&
      charge.period === period
    ));
    if (exists) continue;

    const { error } = await supa.from("charges").insert({
      member_id: member.id,
      kind: "monthly",
      description: `Mensualidad ${plan.name}`,
      amount: plan.amount,
      due_date: dueDate,
      period
    });
    if (!error) created += 1;
  }

  await refreshAll();
  alert(created ? `Se generaron ${created} mensualidades.` : "No habia mensualidades nuevas.");
}

async function confirmNotice(noticeId) {
  const notice = state.notices.find((item) => item.id === noticeId);
  if (!notice || notice.status !== "pending") return;
  const { error: payError } = await supa.from("payments").insert({
    charge_id: notice.charge_id,
    member_id: notice.member_id,
    amount: notice.amount,
    method: "Transferencia informada",
    paid_at: notice.noticed_at || today
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
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const { data, error } = await supa.rpc("create_payment_notice", {
    token: state.portalToken,
    charge: form.chargeId,
    amount: Number(form.amount),
    reference: form.reference.trim()
  });
  if (error || !data?.ok) return alert(data?.message || error?.message || "No se pudo informar el pago.");
  event.currentTarget.reset();
  alert("Transferencia informada");
  await loadPortal();
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
  const currentPeriod = today.slice(0, 7);
  const paidMonth = state.payments.filter((payment) => chargeById(payment.charge_id)?.period === currentPeriod);
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
  syncMemberPeriodOptions();
  const period = selectedMemberPeriod();
  const query = normalizeText($("#memberSearch")?.value || "");
  const visibleMembers = state.members.filter((member) => {
    if (!query) return true;
    return normalizeText([
      member.name,
      member.phone,
      member.email,
      member.plans?.name
    ].join(" ")).includes(query);
  });
  const label = query
    ? `${visibleMembers.length} de ${state.members.length} socios - ${periodLabel(period)}`
    : `${state.members.length} socios - ${periodLabel(period)}`;
  text("#membersLabel", label);
  rows("#memberRows", visibleMembers, (member) => {
    const charges = state.charges.filter((charge) => charge.member_id === member.id && charge.kind === "monthly" && charge.period === period);
    const chargeIds = new Set(charges.map((charge) => charge.id));
    const paid = state.payments
      .filter((payment) => payment.member_id === member.id && chargeIds.has(payment.charge_id))
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const debt = charges.reduce((total, charge) => total + Number(charge.balance || 0), 0);
    const hasOverdue = charges.some((charge) => charge.balance > 0 && charge.status === "overdue");
    const status = charges.length === 0 ? "Sin cargo" : debt <= 0 ? "Al dia" : hasOverdue ? "Moroso" : "Pendiente";
    return `<tr>
      <td>${esc(member.name)}</td>
      <td>${esc(member.plans?.name || "Sin plan")}</td>
      <td>${esc(member.phone)}</td>
      <td class="right">${fmt(paid)}</td>
      <td class="right">${fmt(debt)}</td>
      <td>${badge(status, status === "Al dia" ? "ok" : status === "Moroso" ? "bad" : "warn")}</td>
      <td><button class="secondary" data-copy-link="${esc(member.id)}">Copiar link</button></td>
      <td><button class="secondary" data-whatsapp="${esc(member.id)}">WhatsApp</button></td>
      <td><div class="actions-row"><button class="secondary" data-edit-member="${esc(member.id)}">Editar</button><button class="danger" data-delete-member="${esc(member.id)}">Eliminar</button></div></td>
    </tr>`;
  });
}

function editMember(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  const form = $("#memberForm");
  form.memberId.value = member.id;
  form.name.value = member.name || "";
  form.phone.value = member.phone || "";
  form.email.value = member.email || "";
  form.planId.value = member.plan_id || "";
  form.status.value = member.status || "active";
  text("#memberFormTitle", "Editar socio");
  text("#memberSubmitBtn", "Guardar cambios");
  $("#cancelMemberEditBtn").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetMemberForm() {
  const form = $("#memberForm");
  form.reset();
  form.memberId.value = "";
  form.status.value = "active";
  text("#memberFormTitle", "Nuevo socio");
  text("#memberSubmitBtn", "Guardar socio");
  $("#cancelMemberEditBtn").classList.add("hidden");
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
  syncReportPeriodOptions();
  const period = selectedReportPeriod();
  const report = membersReport(period);
  const filteredReport = filterMembersReport(report);
  const paid = report.filter((item) => item.paymentStatus === "Al dia");
  const overdue = report.filter((item) => item.paymentStatus === "Moroso");
  const debt = report.reduce((total, item) => total + item.debt, 0);

  text("#rTotal", report.length);
  text("#rPaid", paid.length);
  text("#rOverdue", overdue.length);
  text("#rDebt", fmt(debt));
  syncReportFilterCards();
  text("#reportLabel", report.length === filteredReport.length
    ? `${report.length} socios - ${periodLabel(period)}`
    : `${filteredReport.length} de ${report.length} socios - ${periodLabel(period)}`
  );

  rows("#reportRows", filteredReport, (item) => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${esc(item.plan)}</td>
      <td>${esc(item.phone)}</td>
      <td>${esc(item.email)}</td>
      <td>${badge(item.paymentStatus, item.paymentStatus === "Al dia" ? "ok" : item.paymentStatus === "Pendiente" || item.paymentStatus === "Sin cargo" ? "warn" : "bad")}</td>
      <td>${esc(item.lastPayment || "Sin pagos")}</td>
      <td class="right">${fmt(item.paidMonth)}</td>
      <td class="right">${fmt(item.paidTotal)}</td>
      <td class="right">${fmt(item.debt)}</td>
      <td>${badge(item.memberStatus, item.memberStatus === "Activo" ? "ok" : "warn")}</td>
    </tr>
  `);
}

function filterMembersReport(report) {
  const query = normalizeText($("#reportSearch")?.value || "");
  const statusFilter = state.reportStatusFilter || "all";
  return report.filter((item) => {
    const matchesSearch = !query || normalizeText([
      item.name,
      item.plan,
      item.phone,
      item.email
    ].join(" ")).includes(query);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "paid" && item.paymentStatus === "Al dia") ||
      (statusFilter === "overdue" && item.paymentStatus === "Moroso") ||
      (statusFilter === "debt" && item.debt > 0);
    return matchesSearch && matchesStatus;
  });
}

function syncReportFilterCards() {
  $$("[data-report-filter]").forEach((card) => {
    card.classList.toggle("active-filter", card.dataset.reportFilter === (state.reportStatusFilter || "all"));
  });
}

function renderSettings() {
  if (!state.settings) return;
  $("#settingsForm [name='payment_link_url']").value = state.settings.payment_link_url || "";
  $("#settingsForm [name='notice_whatsapp']").value = state.settings.notice_whatsapp || "";
  $("#settingsForm [name='notice_email']").value = state.settings.notice_email || "";
  $("#settingsForm [name='monthly_due_day']").value = state.settings.monthly_due_day || 3;
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
  $("#transferNoticeForm [name='amount']").value = charges[0]?.balance || "";
  rows("#portalChargeRows", charges, (charge) => `
    <tr>
      <td>${esc(charge.description)}</td>
      <td>${date(charge.due_date)}</td>
      <td class="right">${fmt(charge.balance)}</td>
      <td>
        <div class="actions-row">
          <button class="secondary" onclick="openPaymentLink('${esc(charge.id)}')">Pagar Webpay</button>
          <button class="secondary" onclick="notifyPaymentLink('${esc(charge.id)}')">Ya pague Webpay</button>
        </div>
      </td>
    </tr>
  `);
  rows("#portalPaymentRows", payments, (payment) => `
    <tr><td>${date(payment.paid_at)}</td><td>${esc(payment.method)}</td><td class="right">${fmt(payment.amount)}</td></tr>
  `);
}

function membersReport(period = selectedReportPeriod()) {
  return state.members.map((member) => {
    const memberCharges = state.charges.filter((charge) => charge.member_id === member.id && charge.kind === "monthly" && charge.period === period);
    const memberChargeIds = new Set(memberCharges.map((charge) => charge.id));
    const memberPayments = state.payments.filter((payment) => payment.member_id === member.id);
    const periodPayments = memberPayments.filter((payment) => memberChargeIds.has(payment.charge_id));
    const debt = memberCharges.reduce((total, charge) => total + Number(charge.balance || 0), 0);
    const paidMonth = periodPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const paidTotal = memberPayments.reduce((total, payment) => total + Number(payment.amount || 0), 0);
    const hasOverdue = memberCharges.some((charge) => charge.balance > 0 && charge.status === "overdue");
    const hasPending = memberCharges.some((charge) => charge.balance > 0);
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
      paymentStatus: memberCharges.length === 0 ? "Sin cargo" : debt <= 0 ? "Al dia" : hasOverdue ? "Moroso" : hasPending ? "Pendiente" : "Sin cargo",
      lastPayment: lastPayment ? date(lastPayment) : "",
      paidMonth,
      paidTotal,
      debt,
      memberStatus: member.status === "active" ? "Activo" : "Inactivo"
    };
  });
}

function downloadMembersReport() {
  const period = selectedReportPeriod();
  const report = filterMembersReport(membersReport(period));
  const headers = ["Mes", "Socio", "Plan", "Telefono", "Email", "Estado pago", "Ultimo pago", "Pagado mes", "Total pagado", "Deuda", "Estado socio"];
  const lines = [
    headers,
    ...report.map((item) => [
      periodLabel(period),
      item.name,
      item.plan,
      item.phone,
      item.email,
      item.paymentStatus,
      item.lastPayment || "Sin pagos",
      item.paidMonth,
      item.paidTotal,
      item.debt,
      item.memberStatus
    ])
  ];
  const csv = `sep=;\n${lines.map((line) => line.map(csvCell).join(";")).join("\n")}`;
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reporte-socios-${period || today}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reportPeriods() {
  const periods = state.charges
    .filter((charge) => charge.kind === "monthly" && charge.period)
    .map((charge) => charge.period);
  return [...new Set(periods)].sort();
}

function selectedReportPeriod() {
  const select = $("#reportPeriod");
  const periods = reportPeriods();
  const current = today.slice(0, 7);
  if (select?.value) return select.value;
  return periods.includes(current) ? current : periods[0] || current;
}

function selectedMemberPeriod() {
  const select = $("#memberPeriod");
  const periods = reportPeriods();
  const current = today.slice(0, 7);
  if (select?.value) return select.value;
  return periods.includes(current) ? current : periods[0] || current;
}

function syncReportPeriodOptions() {
  const select = $("#reportPeriod");
  if (!select) return;
  const previous = select.value;
  const periods = reportPeriods();
  const current = today.slice(0, 7);
  const selected = previous || (periods.includes(current) ? current : periods[0] || current);
  select.innerHTML = periods.map((period) => option(period, periodLabel(period))).join("");
  if (!periods.includes(selected) && selected) {
    select.insertAdjacentHTML("afterbegin", option(selected, periodLabel(selected)));
  }
  select.value = selected;
}

function syncMemberPeriodOptions() {
  const select = $("#memberPeriod");
  if (!select) return;
  const previous = select.value;
  const periods = reportPeriods();
  const current = today.slice(0, 7);
  const selected = previous || (periods.includes(current) ? current : periods[0] || current);
  select.innerHTML = periods.map((period) => option(period, periodLabel(period))).join("");
  if (!periods.includes(selected) && selected) {
    select.insertAdjacentHTML("afterbegin", option(selected, periodLabel(selected)));
  }
  select.value = selected;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function periodLabel(period) {
  const labels = {
    "01": "Enero",
    "02": "Febrero",
    "03": "Marzo",
    "04": "Abril",
    "05": "Mayo",
    "06": "Junio",
    "07": "Julio",
    "08": "Agosto",
    "09": "Septiembre",
    "10": "Octubre",
    "11": "Noviembre",
    "12": "Diciembre"
  };
  if (!period || !period.includes("-")) return "Mes actual";
  const [year, month] = period.split("-");
  return `${labels[month] || period} ${year}`;
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

async function notifyPaymentLink(chargeId) {
  const charge = state.portalData?.charges?.find((item) => item.id === chargeId);
  const member = state.portalData?.member;
  if (!charge || !member) return;

  const { data, error } = await supa.rpc("create_payment_notice", {
    token: state.portalToken,
    charge: charge.id,
    amount: Number(charge.balance),
    reference: "Pago Webpay informado por socio"
  });

  if (error || !data?.ok) {
    alert(data?.message || error?.message || "No se pudo informar el pago.");
    return;
  }

  alert("Pago Webpay informado");

  const message = [
    `Hola, soy ${member.name}.`,
    `Acabo de pagar por Webpay el cargo "${charge.description}" por ${fmt(charge.balance)}.`,
    "Envio este mensaje para informar mi pago."
  ].join("\n");
  const configuredPhone = whatsappPhone(state.portalData?.settings?.notice_whatsapp || "");
  const whatsappUrl = configuredPhone
    ? `https://wa.me/${configuredPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, "_blank");
  await loadPortal();
}

window.openPaymentLink = openPaymentLink;
window.notifyPaymentLink = notifyPaymentLink;

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

function chargeById(chargeId) {
  return state.charges.find((charge) => charge.id === chargeId);
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
