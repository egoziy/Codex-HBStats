'use client';

import { useMemo, useState } from 'react';

type SmartFilterOption = {
  value: string;
  label: string;
  meta?: Record<string, string[]>;
};

type SmartFilterField = {
  name: string;
  options: SmartFilterOption[];
  className: string;
  includeAllOption?: boolean;
  allLabel?: string;
};

function getVisibleOptions(
  fields: SmartFilterField[],
  fieldIndex: number,
  values: Record<string, string>
) {
  const field = fields[fieldIndex];

  return field.options.filter((option) => {
    for (const dependencyField of fields.slice(0, fieldIndex)) {
      const selectedValue = values[dependencyField.name];
      if (!selectedValue || selectedValue === 'all') continue;

      const allowedValues = option.meta?.[dependencyField.name];
      if (!allowedValues) continue;
      if (!allowedValues.includes(selectedValue)) {
        return false;
      }
    }

    return true;
  });
}

function getFallbackValue(field: SmartFilterField, options: SmartFilterOption[]) {
  if (field.includeAllOption) return 'all';
  return options[0]?.value || '';
}

export default function SmartFilterForm({
  action,
  fields,
  initialValues,
  hiddenFields,
  formClassName,
  buttonClassName,
  submitLabel,
}: {
  action: string;
  fields: SmartFilterField[];
  initialValues: Record<string, string>;
  hiddenFields?: Record<string, string>;
  formClassName: string;
  buttonClassName: string;
  submitLabel: string;
}) {
  const [values, setValues] = useState<Record<string, string>>(initialValues);

  const visibleOptionsByField = useMemo(() => {
    return fields.map((_, index) => getVisibleOptions(fields, index, values));
  }, [fields, values]);

  function updateField(fieldIndex: number, nextValue: string) {
    const nextValues = {
      ...values,
      [fields[fieldIndex].name]: nextValue,
    };

    for (let index = fieldIndex + 1; index < fields.length; index += 1) {
      const nextOptions = getVisibleOptions(fields, index, nextValues);
      const field = fields[index];
      const currentValue = nextValues[field.name];

      const isCurrentStillValid =
        (field.includeAllOption && currentValue === 'all') ||
        nextOptions.some((option) => option.value === currentValue);

      if (!isCurrentStillValid) {
        nextValues[field.name] = getFallbackValue(field, nextOptions);
      }
    }

    setValues(nextValues);
  }

  return (
    <form className={formClassName} action={action}>
      {Object.entries(hiddenFields || {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}

      {fields.map((field, index) => {
        const options = visibleOptionsByField[index];

        return (
          <select
            key={field.name}
            name={field.name}
            value={values[field.name] || (field.includeAllOption ? 'all' : '')}
            onChange={(event) => updateField(index, event.target.value)}
            className={field.className}
          >
            {field.includeAllOption ? <option value="all">{field.allLabel || 'הכול'}</option> : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      })}

      <button className={buttonClassName}>{submitLabel}</button>
    </form>
  );
}
