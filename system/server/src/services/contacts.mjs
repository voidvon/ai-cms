import { execute, queryAll, queryOne } from '../db.mjs';

export function listContacts() {
  return queryAll(
    `
      SELECT
        id,
        office_name,
        address,
        phone,
        fax,
        contact_person,
        email,
        postal_code
      FROM contacts
      ORDER BY id ASC
    `
  );
}

export function getContactById(id) {
  return queryOne(
    `
      SELECT
        id,
        office_name,
        address,
        phone,
        fax,
        contact_person,
        email,
        postal_code
      FROM contacts
      WHERE id = ?
    `,
    [id]
  );
}

export function createContact(input) {
  const payload = normalizeContactInput(input);
  const result = execute(
    `
      INSERT INTO contacts (
        office_name,
        address,
        phone,
        fax,
        contact_person,
        email,
        postal_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.office_name,
      payload.address,
      payload.phone,
      payload.fax,
      payload.contact_person,
      payload.email,
      payload.postal_code
    ]
  );

  return getContactById(result.lastInsertRowid);
}

export function updateContact(id, input) {
  const existing = getContactById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeContactInput({ ...existing, ...input });
  execute(
    `
      UPDATE contacts
      SET
        office_name = ?,
        address = ?,
        phone = ?,
        fax = ?,
        contact_person = ?,
        email = ?,
        postal_code = ?
      WHERE id = ?
    `,
    [
      payload.office_name,
      payload.address,
      payload.phone,
      payload.fax,
      payload.contact_person,
      payload.email,
      payload.postal_code,
      id
    ]
  );

  return getContactById(id);
}

export function deleteContact(id) {
  const existing = getContactById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM contacts WHERE id = ?', [id]);
  return existing;
}

export function normalizeContactInput(input) {
  const officeName = toNullableString(input.office_name);
  if (!officeName) {
    throw new Error('office_name is required');
  }

  return {
    office_name: officeName,
    address: toNullableString(input.address),
    phone: toNullableString(input.phone),
    fax: toNullableString(input.fax),
    contact_person: toNullableString(input.contact_person),
    email: toNullableString(input.email),
    postal_code: toNullableString(input.postal_code)
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}
