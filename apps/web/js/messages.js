// Plain-words messages for every API error code. Nothing here ever names a record, a rule or a table.
export const MESSAGES = {
  not_found: "We couldn't find that. It may not exist, or you may not have access.",
  invalid: 'Some details need fixing. Check the highlighted fields and try again.',
  conflict: 'This was changed or already exists. Refresh and try again.',
  unavailable: 'The service is waking up or busy. Try again in a minute.',
  failed: 'Something went wrong. Nothing was changed.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  org_required: 'Choose an organization first.',
  session_expired: 'Your session has ended. Sign in again.',
  bad_request: 'That request could not be read.',
  storage_limit: 'The storage limit has been reached, so this file was not saved. Delete files you no longer need, or ask an admin.',
  storage_unavailable: 'File storage is not available right now.',
  offline: "You appear to be offline. Nothing was saved. Check your connection and try again.",
};
export const messageFor = (code) => MESSAGES[code] ?? MESSAGES.failed;

// Plain wording for field names the server reports in `invalid` answers.
export const FIELD_LABELS = {
  name: 'Name', title: 'Title', summary: 'Summary', pains: 'Pains', desires: 'Desires', objections: 'Objections', promise: 'Promise', description: 'Description',
  price_amount: 'Price', currency: 'Currency', body: 'Story', voice: 'Voice', colors: 'Colours', fonts: 'Fonts', notes: 'Notes', kind: 'Type', avatar_id: 'Avatar', offer_id: 'Offer', client: 'Client',
};
export const fieldLabel = (f) => FIELD_LABELS[f] ?? 'a field';
