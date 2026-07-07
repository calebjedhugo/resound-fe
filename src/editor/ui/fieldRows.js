/**
 * Shared DOM builders for sidebar form rows ("Label: [control]").
 * MetadataPanel and PropertyPanel render their fields through these so the
 * row structure and styling hooks (.prop-row/.prop-input/.prop-select) stay
 * identical across panels.
 */

export function addSelectRow(wrapper, labelText, options, current, onChange) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = `${labelText}: `;
  row.appendChild(label);
  const select = document.createElement('select');
  select.className = 'prop-select';
  options.forEach((o) => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (current === o) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = () => onChange(select.value);
  row.appendChild(select);
  wrapper.appendChild(row);
  return select;
}

export function addInputRow(
  wrapper,
  { type, label: labelText, value, onChange, tooltip, ...constraints }
) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  if (tooltip) row.title = tooltip;

  const label = document.createElement('label');
  label.textContent = `${labelText}: `;
  row.appendChild(label);

  const input = document.createElement('input');
  input.type = type;
  input.className = 'prop-input';
  if (constraints.min != null) input.min = constraints.min;
  if (constraints.max != null) input.max = constraints.max;
  if (constraints.step != null) input.step = constraints.step;
  input.value = value;
  input.onchange = () => onChange(input.value);
  row.appendChild(input);

  wrapper.appendChild(row);
  return input;
}
