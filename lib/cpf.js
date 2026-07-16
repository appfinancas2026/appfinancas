export function formatarCPF(valor) {
  const nums = (valor || '').replace(/\D/g, '').slice(0, 11);

  if (nums.length <= 3) return nums;
  if (nums.length <= 6) return `${nums.slice(0, 3)}.${nums.slice(3)}`;
  if (nums.length <= 9) return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6)}`;
  return `${nums.slice(0, 3)}.${nums.slice(3, 6)}.${nums.slice(6, 9)}-${nums.slice(9)}`;
}

export function cpfValido(valor) {
  const nums = (valor || '').replace(/\D/g, '');

  if (nums.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(nums)) return false;

  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i], 10) * (10 - i);
  let resto = (soma * 10) % 11;
  const d1 = resto === 10 ? 0 : resto;
  if (d1 !== parseInt(nums[9], 10)) return false;

  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i], 10) * (11 - i);
  resto = (soma * 10) % 11;
  const d2 = resto === 10 ? 0 : resto;

  return d2 === parseInt(nums[10], 10);
}
