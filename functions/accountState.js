// Shared account-state helpers. Legacy documents without the new flags are treated as active.
function isAccountLive(profile) {
  if (!profile) return false;
  const status = String(profile.status || "").toUpperCase();
  return (
    profile.isActive !== false &&
    profile.isArchived !== true &&
    status !== "INACTIVE" &&
    status !== "ARCHIVED"
  );
}

function isRecordArchived(record) {
  return record?.isArchived === true;
}

module.exports = { isAccountLive, isRecordArchived };
