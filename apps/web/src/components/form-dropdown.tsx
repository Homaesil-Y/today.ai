"use client";

import { useState } from "react";
import { Dropdown } from "@/components/dropdown";

type Option = { value: string; label: string };

// 폼(네이티브 form / server action) 안에서 쓰는 비제어 드롭다운.
// 선택값을 hidden input으로 실어보내 기존 name 기반 제출을 그대로 유지한다.
export function FormDropdown({
  name,
  defaultValue = "",
  options,
  placeholder,
  ariaLabel,
  disabled = false,
}: {
  name: string;
  defaultValue?: string;
  options: Option[];
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Dropdown
        value={value}
        onChange={setValue}
        options={options}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    </>
  );
}
