// Asia/Kolkata helpers. Store canonical UTC (Date) + IST display strings.
function istParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const tfmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const d = fmt.format(date); // YYYY-MM-DD
  const t = tfmt.format(date); // HH:MM:SS
  return { date: d, time: t, timezone: 'Asia/Kolkata' };
}

function todayIST() {
  return istParts(new Date()).date;
}

function prettyDateIST(dateStr) {
  // dateStr YYYY-MM-DD -> 15 September 2026
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${d} ${months[m - 1]} ${y}`;
}

function dayNameIST(date = new Date()) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(date);
}

module.exports = { istParts, todayIST, prettyDateIST, dayNameIST };
