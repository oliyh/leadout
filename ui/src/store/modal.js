import { signal } from '@preact/signals';

// null | { type: 'new-programme' }
//      | { type: 'template', progId }
//      | { type: 'confirm-delete', progId }
//      | { type: 'confirm-unsubscribe', channelId, channelName }
//      | { type: 'confirm-remove-device', deviceId, deviceCode }
//      | { type: 'clone-programme', prog, channelId }
export const modal = signal(null);

export function openNewProgramme() { modal.value = { type: 'new-programme' }; }
export function openTemplateModal(progId) { modal.value = { type: 'template', progId }; }
export function openConfirmDelete(progId) { modal.value = { type: 'confirm-delete', progId }; }
export function openConfirmUnsubscribe(channelId, channelName) { modal.value = { type: 'confirm-unsubscribe', channelId, channelName }; }
export function openConfirmRemoveDevice(deviceId, deviceCode) { modal.value = { type: 'confirm-remove-device', deviceId, deviceCode }; }
export function openCloneProgramme(prog, channelId) { modal.value = { type: 'clone-programme', prog, channelId }; }
export function closeModal() { modal.value = null; }
