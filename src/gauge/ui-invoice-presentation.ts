import { type Report } from './ui-describe'
import { type Value } from './model'
import { escape as e, form, input, area, choices, check } from './ui-forms'
import { timeModes, expenseModes, presentationDefaults } from './invoice-presentation'
export const presentationFields = (value: Value = presentationDefaults) => choices('timeMode', 'Time presentation', [...timeModes], value.timeMode) + choices('expenseMode', 'Expense presentation', [...expenseModes], value.expenseMode) + choices('attachDetail', 'Attach source detail', ['true', 'false'], String(value.attachDetail))
export function invoiceSettingsSection(report: Report) {
 const rows = report.data.invoiceSettings
 const scopes = [{ id: null, name: 'Agency default' }, ...report.data.clients.filter(c => !c.value.mergedInto).map(c => ({ id: c.id, name: c.value.name }))]
 return `<section class="g-block" id="invoice-settings"><h2>Invoice presentation settings</h2><p>Client defaults override the agency default. Draft presentation can be changed before issue; issued originals and their sources stay fixed. Details allow paragraphs, line breaks, bold and italic text.</p>${scopes.map(scope => {
  const row = rows.find(r => r.value.clientId === scope.id), agency = rows.find(r => r.value.clientId === null), v = row?.value ?? agency?.value ?? presentationDefaults
  return `<details class="g-card"><summary>${e(scope.name)}</summary>${form('invoice:settings', 'Document defaults', `<input type="hidden" name="clientId" value="${e(scope.id ?? '')}">` + presentationFields(v) + area('additionalDetails', 'Additional details (limited HTML)', v.additionalDetails, false) + area('footer', 'Footer and remittance text', v.footer, false) + '<label class="g-field"><span>Agency logo (PNG or JPEG, up to 128 KiB)</span><input type="file" name="file" accept="image/png,image/jpeg"></label>' + check('clearLogo', 'Remove saved logo') + input('reason', 'Reason for the settings change'), row, 'Save document defaults', 'g-bare')}</details>`
 }).join('')}</section>`
}
