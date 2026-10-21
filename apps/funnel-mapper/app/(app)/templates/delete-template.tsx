"use client";
import { useTransition } from "react";
import { Icon } from "@/components/icon";
import { deleteTemplateAction } from "../actions";

export function DeleteTemplate({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn sm danger" disabled={pending} onClick={() => confirm(`Delete template “${name}”?`) && start(() => deleteTemplateAction(id))}>
      <Icon name="trash" size={16} /> Delete
    </button>
  );
}
