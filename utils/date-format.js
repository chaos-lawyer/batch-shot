function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDateTime(dateValue, format, fallback = '') {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return (format || '')
    .replaceAll('YYYY', String(date.getFullYear()))
    .replaceAll('MM', pad(date.getMonth() + 1))
    .replaceAll('DD', pad(date.getDate()))
    .replaceAll('HH', pad(date.getHours()))
    .replaceAll('mm', pad(date.getMinutes()))
    .replaceAll('ss', pad(date.getSeconds()));
}
