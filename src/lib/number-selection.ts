export function numberSelection(text: string, count: number) {
  if (!/^[1-9]\d*$/.test(text)) return undefined;
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number > count) return undefined;
  return { index: number - 1, waitForMoreDigits: number * 10 <= count };
}
