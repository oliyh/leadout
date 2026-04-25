import { signal } from '@preact/signals';

// null | { type: 'new-programme' }
//      | { type: 'template', progId }
//      | { type: 'confirm-delete', progId }
export const modal = signal(null);

export function openNewProgramme() { modal.value = { type: 'new-programme' }; }
export function openTemplateModal(progId) { modal.value = { type: 'template', progId }; }
export function openConfirmDelete(progId) { modal.value = { type: 'confirm-delete', progId }; }
export function closeModal() { modal.value = null; }
