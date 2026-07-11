const SUPABASE_URL = "https://pxslwxgthcxiqjbnaznd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2x3eGd0aGN4aXFqYm5hem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTM4MjQsImV4cCI6MjA5OTAyOTgyNH0.i9NnNhX_Q-1mgGz03n7uw-z_oQee9NmQ8FQAVoOF8Hw";
const IRONPAY_PUBLIC_URL = "https://ironpay-publicable-2.vercel.app/";

const supa = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const classInfo = {
  Strong: { icon: "STR", description: "Fuerza" },
  Crossfit: { icon: "CF", description: "Alto rendimiento" },
  GAP: { icon: "GAP", description: "Gluteos, abdomen y piernas" },
  Funcional: { icon: "FUN", description: "Movimiento y resistencia" },
  Hyrox: { icon: "HYX", description: "Condicion total" },
  Kids: { icon: "KID", description: "Entrenamiento infantil" },
};

const fallbackTemplates = [
  ["Lunes", "07:30", "Strong"],
  ["Lunes", "08:30", "GAP"],
  ["Lunes", "09:30", "Strong"],
  ["Lunes", "18:00", "GAP"],
  ["Lunes", "19:00", "Strong"],
  ["Lunes", "20:00", "GAP"],
  ["Martes", "07:30", "Crossfit"],
  ["Martes", "08:30", "Funcional"],
  ["Martes", "09:30", "Crossfit"],
  ["Martes", "18:00", "Funcional"],
  ["Martes", "19:00", "Crossfit"],
  ["Martes", "20:00", "Funcional"],
  ["Miercoles", "07:30", "GAP"],
  ["Miercoles", "08:30", "Strong"],
  ["Miercoles", "09:30", "GAP"],
  ["Miercoles", "18:00", "Strong"],
  ["Miercoles", "19:00", "GAP"],
  ["Miercoles", "20:00", "Strong"],
  ["Jueves", "07:30", "Funcional"],
  ["Jueves", "08:30", "Hyrox"],
  ["Jueves", "09:30", "Funcional"],
  ["Jueves", "18:00", "Hyrox"],
  ["Jueves", "19:00", "Funcional"],
  ["Jueves", "20:00", "Hyrox"],
  ["Viernes", "07:30", "Crossfit"],
  ["Viernes", "08:30", "Strong"],
  ["Viernes", "09:30", "Crossfit"],
  ["Viernes", "18:00", "Strong"],
  ["Viernes", "19:00", "Crossfit"],
  ["Viernes", "20:00", "Strong"],
  ["Sabado", "09:30", "Funcional"],
  ["Sabado", "11:00", "Kids"],
];

const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const memberLoginForm = document.querySelector("#memberLoginForm");
const memberIdentifier = document.querySelector("#memberIdentifier");
const memberSummary = document.querySelector("#memberSummary");
const memberAgenda = document.querySelector("#memberAgenda");
const memberName = document.querySelector("#memberName");
const memberPlan = document.querySelector("#memberPlan");
const memberStatus = document.querySelector("#memberStatus");
const memberExpiry = document.querySelector("#memberExpiry");
const paymentLink = document.querySelector("#paymentLink");
const bookingList = document.querySelector("#bookingList");
const memberCalendar = document.querySelector("#memberCalendar");
const syncIronPayButton = document.querySelector("#syncIronPayButton");
const toast = document.querySelector("#toast");

let portalData = null;

function debt() {
  return (portalData?.charges || []).reduce((total, charge) => total + Number(charge.balance || 0), 0);
}

function isMemberActive() {
  return portalData?.member?.status === "active" && debt() <= 0;
}

function paymentUrl() {
  const settings = portalData?.settings;
  const firstCharge = portalData?.charges?.[0];
  if (!settings?.payment_link_url) {
    const url = new URL(IRONPAY_PUBLIC_URL);
    url.searchParams.set("portal", portalData.member.access_token);
    return url.toString();
  }
  const params = new URLSearchParams(firstCharge ? { cargo: firstCharge.id } : {});
  const separator = settings.payment_link_url.includes("?") ? "&" : "?";
  return params.toString() ? `${settings.payment_link_url}${separator}${params.toString()}` : settings.payment_link_url;
}

function normalizeTemplates() {
  const templates = portalData?.templates || [];
  if (templates.length > 0) {
    return templates.map((item) => ({
      id: item.id,
      day: item.day_name,
      time: String(item.start_time).slice(0, 5),
      name: item.class_name,
      capacity: item.capacity || 15,
      classDate: occupancyFor(item.id)?.class_date,
      booked: occupancyFor(item.id)?.booked || 0,
      waitlist: occupancyFor(item.id)?.waitlist || 0,
    }));
  }

  return fallbackTemplates.map(([day, time, name], index) => ({
    id: `demo-${index}`,
    day,
    time,
    name,
    capacity: 15,
    classDate: "",
    booked: 0,
    waitlist: 0,
  }));
}

function occupancyFor(templateId) {
  return (portalData?.occupancy || []).find((item) => item.template_id === templateId);
}

function bookingFor(templateId) {
  return (portalData?.bookings || []).find((item) => item.template_id === templateId);
}

async function loginMember(event) {
  event.preventDefault();
  if (!supa) {
    showToast("No se pudo cargar Supabase. Revisa conexion a internet.");
    return;
  }

  const identifier = memberIdentifier.value.trim();
  if (!identifier) return;

  const { data, error } = await supa.rpc("get_agenda_portal", { identifier });

  if (error) {
    const fallback = await supa.rpc("get_member_portal_by_identifier", { identifier });
    if (fallback.error || !fallback.data?.ok) {
      showToast("No encontre un socio con ese email o telefono.");
      return;
    }
    portalData = fallback.data;
    showToast("Socio conectado. Instala la extension SQL para guardar reservas reales.");
  } else if (!data?.ok) {
    showToast("No encontre un socio activo con ese email o telefono.");
    return;
  } else {
    portalData = data;
    showToast("Socio conectado con IronPay.");
  }

  memberSummary.classList.remove("hidden");
  memberAgenda.classList.remove("hidden");
  renderAll();
}

function renderProfile() {
  const member = portalData.member;
  const plan = portalData.plan;
  const currentDebt = debt();
  const active = isMemberActive();

  memberName.textContent = member.name;
  memberPlan.textContent = plan ? `${plan.name} - ${plan.discipline}` : "Sin plan asignado";
  memberStatus.textContent = active ? "Activo" : currentDebt > 0 ? "Pago pendiente" : "Inactivo";
  memberStatus.className = active ? "status-pill active" : "status-pill overdue";
  memberExpiry.textContent =
    currentDebt > 0 ? `Saldo pendiente: ${formatMoney(currentDebt)}` : "Sin deuda registrada en IronPay.";
  paymentLink.href = paymentUrl();
  paymentLink.classList.toggle("hidden", active || paymentLink.href.endsWith("#"));
}

function renderBookings() {
  const bookings = portalData.bookings || [];
  const templates = normalizeTemplates();

  if (bookings.length === 0) {
    bookingList.innerHTML = `<li class="empty-booking">Aun no tienes clases reservadas.</li>`;
    return;
  }

  bookingList.innerHTML = bookings
    .map((booking) => {
      const item = templates.find((template) => template.id === booking.template_id);
      return `
        <li>
          <div>
            <strong>${item?.name || "Clase"}</strong>
            <span>${item?.day || ""} ${item?.time || ""} ${booking.status === "waitlist" ? "- lista de espera" : ""}</span>
          </div>
          <button type="button" data-cancel="${booking.id}">Cancelar</button>
        </li>
      `;
    })
    .join("");

  bookingList.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelBooking(button.dataset.cancel));
  });
}

function renderCalendar() {
  const templates = normalizeTemplates();

  memberCalendar.innerHTML = days
    .map(
      (day) => `
        <section class="member-day">
          <h3>${day}</h3>
          ${templates
            .filter((item) => item.day === day)
            .map((item) => classButton(item))
            .join("")}
        </section>
      `
    )
    .join("");

  memberCalendar.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => bookClass(button.dataset.book));
  });
}

function classButton(item) {
  const booking = bookingFor(item.id);
  const booked = Boolean(booking);
  const full = item.booked >= item.capacity;
  const blocked = !isMemberActive();
  const label = blocked ? "Pagar para reservar" : booked ? "Reservada" : full ? "Lista de espera" : "Reservar";

  return `
    <article class="member-class ${booked ? "booked" : ""} ${full ? "full" : ""}">
      <div>
        <span>${item.time}</span>
        <strong>${classInfo[item.name]?.icon || "CL"} ${item.name}</strong>
        <small>${classInfo[item.name]?.description || "Entrenamiento"}</small>
      </div>
      <div class="member-class-action">
        <span>${item.booked}/${item.capacity}${item.waitlist ? ` +${item.waitlist}` : ""}</span>
        <button type="button" data-book="${item.id}" ${blocked || booked ? "disabled" : ""}>${label}</button>
      </div>
    </article>
  `;
}

async function bookClass(templateId) {
  const template = normalizeTemplates().find((item) => item.id === templateId);

  if (!isMemberActive()) {
    showToast("Debes regularizar tu pago en IronPay para reservar.");
    return;
  }

  if (!portalData.templates) {
    showToast("Instala agenda-ironpay-extension.sql para guardar reservas reales.");
    return;
  }

  const { data, error } = await supa.rpc("book_agenda_class", {
    token: portalData.member.access_token,
    template: templateId,
    class_date: template.classDate,
  });

  if (error || !data?.ok) {
    showToast(data?.message || error?.message || "No se pudo reservar.");
    return;
  }

  showToast(data.status === "waitlist" ? "Clase llena: quedaste en lista de espera." : "Clase reservada.");
  await reloadPortal();
}

async function cancelBooking(bookingId) {
  const { data, error } = await supa.rpc("cancel_agenda_booking", {
    token: portalData.member.access_token,
    booking: bookingId,
  });

  if (error || !data?.ok) {
    showToast(data?.message || error?.message || "No se pudo cancelar.");
    return;
  }

  showToast("Reserva cancelada.");
  await reloadPortal();
}

async function reloadPortal() {
  const identifier = memberIdentifier.value.trim();
  const { data, error } = await supa.rpc("get_agenda_portal", { identifier });
  if (!error && data?.ok) portalData = data;
  renderAll();
}

async function syncIronPayStatus(event) {
  event.preventDefault();
  if (!portalData) {
    showToast("Ingresa primero con email o telefono.");
    return;
  }
  await reloadPortal();
  showToast(isMemberActive() ? "IronPay actualizado: puedes reservar." : "IronPay actualizado: pago pendiente.");
}

function renderAll() {
  renderProfile();
  renderBookings();
  renderCalendar();
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

memberLoginForm.addEventListener("submit", loginMember);
syncIronPayButton.addEventListener("click", syncIronPayStatus);
