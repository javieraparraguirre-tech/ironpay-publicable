const SUPABASE_URL = "https://pxslwxgthcxiqjbnaznd.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c2x3eGd0aGN4aXFqYm5hem5kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NTM4MjQsImV4cCI6MjA5OTAyOTgyNH0.i9NnNhX_Q-1mgGz03n7uw-z_oQee9NmQ8FQAVoOF8Hw";
const IRONPAY_PUBLIC_URL = "https://ironpay-agenda-publicable-3.vercel.app/";

const supa = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const classInfo = {
  Strong: { icon: "STR", description: "Fuerza" },
  Crossfit: { icon: "CF", description: "Alto rendimiento" },
  GAP: { icon: "GAP", description: "Gluteos, abdomen y piernas" },
  Funcional: { icon: "FUN", description: "Movimiento y resistencia" },
  Hyrox: { icon: "HYX", description: "Condicion total" },
  "Funcional-Hyrox": { icon: "F-H", description: "Movimiento, resistencia y condicion total" },
  Kids: { icon: "KID", description: "Entrenamiento infantil" },
};

const fallbackTemplates = [
  ["Lunes", "07:30", "Strong"],
  ["Lunes", "08:30", "GAP"],
  ["Lunes", "09:30", "Strong"],
  ["Lunes", "18:00", "Strong"],
  ["Lunes", "19:00", "GAP"],
  ["Lunes", "20:00", "Strong"],
  ["Martes", "07:30", "Crossfit"],
  ["Martes", "08:30", "Funcional"],
  ["Martes", "09:30", "Crossfit"],
  ["Martes", "18:00", "Funcional"],
  ["Martes", "19:00", "Crossfit"],
  ["Martes", "20:00", "Funcional"],
  ["Miercoles", "07:30", "Strong"],
  ["Miercoles", "08:30", "GAP"],
  ["Miercoles", "09:30", "Strong"],
  ["Miercoles", "18:00", "Strong"],
  ["Miercoles", "19:00", "GAP"],
  ["Miercoles", "20:00", "Strong"],
  ["Jueves", "07:30", "Funcional-Hyrox"],
  ["Jueves", "08:30", "Crossfit"],
  ["Jueves", "09:30", "Funcional-Hyrox"],
  ["Jueves", "18:00", "Crossfit"],
  ["Jueves", "19:00", "Funcional-Hyrox"],
  ["Jueves", "20:00", "Crossfit"],
  ["Viernes", "07:30", "Strong"],
  ["Viernes", "08:30", "Crossfit"],
  ["Viernes", "09:30", "Strong"],
  ["Viernes", "18:00", "Strong"],
  ["Viernes", "19:00", "Crossfit"],
  ["Viernes", "20:00", "Strong"],
  ["Sabado", "09:30", "Funcional"],
  ["Sabado", "11:00", "Kids"],
];

const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const dayNumbers = { Lunes: 1, Martes: 2, Miercoles: 3, Jueves: 4, Viernes: 5, Sabado: 6 };
const memberLoginForm = document.querySelector("#memberLoginForm");
const memberIdentifier = document.querySelector("#memberIdentifier");
const memberSummary = document.querySelector("#memberSummary");
const todayPanel = document.querySelector("#todayPanel");
const todayTitle = document.querySelector("#todayTitle");
const todayCutoffText = document.querySelector("#todayCutoffText");
const todayClasses = document.querySelector("#todayClasses");
const memberAgenda = document.querySelector("#memberAgenda");
const memberName = document.querySelector("#memberName");
const memberPlan = document.querySelector("#memberPlan");
const memberStatus = document.querySelector("#memberStatus");
const memberExpiry = document.querySelector("#memberExpiry");
const paymentLink = document.querySelector("#paymentLink");
const buySingleClassButton = document.querySelector("#buySingleClassButton");
const bookingList = document.querySelector("#bookingList");
const memberCalendar = document.querySelector("#memberCalendar");
const syncIronPayButton = document.querySelector("#syncIronPayButton");
const toast = document.querySelector("#toast");

let portalData = null;

function debt() {
  return (portalData?.charges || []).reduce((total, charge) => total + Number(charge.balance || 0), 0);
}

function currentDebt() {
  const currentPeriod = chileNow().date.slice(0, 7);
  return (portalData?.charges || [])
    .filter((charge) => charge.kind !== "single_class" && (!charge.period || charge.period <= currentPeriod))
    .reduce((total, charge) => total + Number(charge.balance || 0), 0);
}

function blockingDebt() {
  const currentDate = chileNow().date;
  return (portalData?.charges || [])
    .filter((charge) => charge.kind !== "single_class" && charge.due_date <= currentDate)
    .reduce((total, charge) => total + Number(charge.balance || 0), 0);
}

function overdueDebt() {
  return (portalData?.charges || [])
    .filter((charge) => charge.kind !== "single_class" && charge.status === "overdue")
    .reduce((total, charge) => total + Number(charge.balance || 0), 0);
}

function isMemberActive() {
  return portalData?.member?.status === "active" && blockingDebt() <= 0;
}

function paymentUrl() {
  const firstCharge = portalData?.charges?.[0];
  const url = new URL(IRONPAY_PUBLIC_URL);
  url.searchParams.set("portal", portalData.member.access_token);
  if (firstCharge?.id) url.searchParams.set("cargo", firstCharge.id);
  return url.toString();
}

function normalizeTemplates() {
  const templates = portalData?.templates || [];
  if (templates.length > 0) {
    return templates
      .map((item) => {
        const occupancy = occupancyFor(item.id);
        const classDate = visibleDateForDay(item.day_of_week);
        return {
          id: item.id,
          day: item.day_name,
          time: String(item.start_time).slice(0, 5),
          name: item.class_name,
          capacity: item.capacity || 15,
          classDate,
          booked: occupancy?.class_date === classDate ? occupancy.booked || 0 : 0,
          waitlist: occupancy?.class_date === classDate ? occupancy.waitlist || 0 : 0,
        };
      })
      .filter((item) => item.classDate);
  }

  return fallbackTemplates
    .map(([day, time, name], index) => ({
      id: `demo-${index}`,
      day,
      time,
      name,
      capacity: 15,
      classDate: visibleDateForDay(dayNumbers[day]),
      booked: 0,
      waitlist: 0,
    }))
    .filter((item) => item.classDate);
}

function visibleDateForDay(dayOfWeek) {
  const windowStart = scheduleWindowStart();
  const visibleStartIsoDay = windowStart.isoDay;

  if (dayOfWeek < visibleStartIsoDay || dayOfWeek > 6) return "";

  return addDays(windowStart.date, dayOfWeek - visibleStartIsoDay);
}

function visibleDays() {
  const templateDays = new Set(normalizeTemplates().map((item) => item.day));
  return days.filter((day) => templateDays.has(day));
}

function scheduleWindowStart() {
  const now = chileNow();
  const afterCutoff = now.hour >= 15;

  if (now.isoDay === 7) {
    const date = addDays(now.date, 1);
    return { date, isoDay: 1 };
  }

  if (afterCutoff) {
    const date = addDays(now.date, now.isoDay === 6 ? 2 : 1);
    return { date, isoDay: now.isoDay === 6 ? 1 : now.isoDay + 1 };
  }

  return { date: now.date, isoDay: now.isoDay };
}

function chileNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return {
    date,
    hour: Number(parts.hour),
    isoDay: isoDayFromDate(date),
  };
}

function isoDayFromDate(dateString) {
  const day = new Date(`${dateString}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function dayNameFromDate(dateString) {
  if (!dateString) return "";
  return days[isoDayFromDate(dateString) - 1] || "";
}

function addDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
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
  todayPanel.classList.remove("hidden");
  memberAgenda.classList.remove("hidden");
  renderAll();
}

function renderProfile() {
  const member = portalData.member;
  const plan = portalData.plan;
  const quota = portalData.agenda_quota;
  const totalDebt = debt();
  const currentMemberDebt = currentDebt();
  const currentBlockingDebt = blockingDebt();
  const currentOverdueDebt = overdueDebt();
  const active = isMemberActive();

  memberName.textContent = member.name;
  memberPlan.textContent = plan ? `${plan.name} - ${plan.discipline}` : "Sin plan asignado";
  memberStatus.textContent = active ? "Activo" : currentBlockingDebt > 0 ? "Pago pendiente" : "Inactivo";
  memberStatus.className = active ? "status-pill active" : "status-pill overdue";
  memberExpiry.innerHTML =
    currentBlockingDebt > 0 || currentOverdueDebt > 0
      ? `Saldo vencido: ${formatMoney(Math.max(currentBlockingDebt, currentOverdueDebt))}`
      : currentMemberDebt > 0
        ? `Saldo pendiente del mes actual: ${formatMoney(currentMemberDebt)}. Puedes agendar hasta el dia anterior al vencimiento.`
        : totalDebt > 0
          ? `Mes actual al dia. Saldo futuro registrado: ${formatMoney(totalDebt)}.${quotaText(quota)}`
          : `Sin deuda registrada en IronPay.${quotaText(quota)}`;
  paymentLink.href = paymentUrl();
  paymentLink.classList.toggle("hidden", totalDebt <= 0 || paymentLink.href.endsWith("#"));
  buySingleClassButton.classList.toggle("hidden", !quota?.uses_paid_class_credits);
}

function quotaText(quota) {
  if (!quota) return "";
  if (quota.uses_paid_class_credits) {
    return `<br>Clases pagadas disponibles: ${quota.available_class_credits || 0}.`;
  }
  if (quota.weekly_class_limit === null || quota.weekly_class_limit === undefined) {
    return "<br>Agendamiento semanal: ilimitado.";
  }
  return `<br>Agendamiento semanal: ${quota.weekly_used || 0}/${quota.weekly_class_limit} clases.`;
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
      const className = booking.class_name || item?.name || "Clase";
      const dayName = booking.day_name || item?.day || dayNameFromDate(booking.class_date);
      const startTime = String(booking.start_time || item?.time || "").slice(0, 5);
      const bookingInfo = `${dayName} ${startTime}`.trim();
      return `
        <li>
          <div>
            <strong>${className}</strong>
            <span>${bookingInfo} ${booking.status === "waitlist" ? "- lista de espera" : ""}</span>
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
  const todayDate = chileNow().date;
  const upcomingTemplates = templates.filter((item) => item.classDate !== todayDate);

  memberCalendar.innerHTML = visibleDaysFor(upcomingTemplates)
    .map(
      (day) => `
        <section class="member-day">
          <h3>${day}</h3>
          ${templates
            .filter((item) => item.classDate !== todayDate)
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

function renderToday() {
  const templates = normalizeTemplates();
  const now = chileNow();
  const todayDate = now.date;
  const todayItems = templates.filter((item) => item.classDate === todayDate);
  const afterCutoff = now.hour >= 15;

  todayTitle.textContent = `Agenda de ${days[now.isoDay - 1] || "hoy"}`;
  todayCutoffText.textContent = afterCutoff
    ? "El agendamiento de hoy ya cerro a las 15:00 hrs."
    : "Disponible hasta las 15:00 hrs.";

  if (todayItems.length === 0) {
    todayClasses.innerHTML = `
      <div class="empty-today">
        No hay clases disponibles para agendar hoy. Revisa los proximos entrenamientos.
      </div>
    `;
    return;
  }

  todayClasses.innerHTML = todayItems.map((item) => classButton(item)).join("");
  todayClasses.querySelectorAll("[data-book]").forEach((button) => {
    button.addEventListener("click", () => bookClass(button.dataset.book));
  });
}

function visibleDaysFor(templates) {
  const templateDays = new Set(templates.map((item) => item.day));
  return days.filter((day) => templateDays.has(day));
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
    showToast("Debes regularizar tu pago vencido en IronPay para reservar.");
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

async function buySingleClass(event) {
  event.preventDefault();
  if (!portalData) {
    showToast("Ingresa primero con email o telefono.");
    return;
  }

  const { data, error } = await supa.rpc("request_single_class_charge", {
    token: portalData.member.access_token,
  });

  if (error || !data?.ok) {
    showToast(data?.message || error?.message || "No se pudo crear el cobro.");
    return;
  }

  await reloadPortal();
  paymentLink.href = paymentUrl();
  paymentLink.classList.remove("hidden");
  showToast(data.message || "Clase creada. Puedes pagar en IronPay.");
}

async function syncIronPayStatus(event) {
  event.preventDefault();
  if (!portalData) {
    showToast("Ingresa primero con email o telefono.");
    return;
  }
  await reloadPortal();
  showToast(isMemberActive() ? "IronPay actualizado: puedes reservar." : "IronPay actualizado: deuda vencida.");
}

function renderAll() {
  renderProfile();
  renderBookings();
  renderToday();
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
buySingleClassButton.addEventListener("click", buySingleClass);
syncIronPayButton.addEventListener("click", syncIronPayStatus);
