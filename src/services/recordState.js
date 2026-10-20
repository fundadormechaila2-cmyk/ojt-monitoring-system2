// Legacy documents without lifecycle flags are treated as active.
export const isArchivedRecord = (record) => record?.isArchived === true;

export const isDeactivatedRecord = (record) =>
  record?.isActive === false || ["INACTIVE", "ARCHIVED"].includes(String(record?.status || "").toUpperCase());

export const isAccountLive = (profile) => !!profile && !isArchivedRecord(profile) && !isDeactivatedRecord(profile);

export const withoutArchived = (records) => records.filter((record) => !isArchivedRecord(record));
