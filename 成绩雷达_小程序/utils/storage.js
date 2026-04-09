const EXAMS_KEY = 'xueji_exams';
const PROFILES_KEY = 'xueji_profiles';
const ACTIVE_PROFILE_KEY = 'xueji_active_profile';
const TREND_MODE_KEY = 'xueji_trend_mode';
const RADAR_SELECTION_KEY = 'xueji_radar_selection';
const FORM_MEMORY_KEY = 'xueji_form_memory';

let _storageHooks = {
  onChange: null,
  isSuppressed: null
};
let _silentMode = false;

function readJSON(key, fallback) {
  try {
    const value = wx.getStorageSync(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJSON(key, value) {
  wx.setStorageSync(key, JSON.stringify(value));
}

function notifyChange(change) {
  if (_silentMode) return;
  if (typeof _storageHooks.isSuppressed === 'function' && _storageHooks.isSuppressed()) return;
  if (typeof _storageHooks.onChange === 'function') {
    _storageHooks.onChange(change || {});
  }
}

function getProfiles() {
  return readJSON(PROFILES_KEY, []);
}

function saveProfiles(profiles) {
  writeJSON(PROFILES_KEY, profiles);
  notifyChange({ type: 'profiles-save' });
}

function getActiveProfileId() {
  return wx.getStorageSync(ACTIVE_PROFILE_KEY) || '';
}

function setActiveProfileId(id) {
  wx.setStorageSync(ACTIVE_PROFILE_KEY, id);
}

function getExamsAll() {
  return readJSON(EXAMS_KEY, []);
}

function saveExamsAll(exams) {
  writeJSON(EXAMS_KEY, exams);
  notifyChange({ type: 'exams-save' });
}

function saveProfileExams(profileId, profileExams) {
  const others = getExamsAll().filter((item) => item.profileId !== profileId);
  saveExamsAll(others.concat(profileExams));
}

function getExams(profileId, excludeHidden = false) {
  let exams = getExamsAll();
  if (profileId) {
    exams = exams.filter((item) => item.profileId === profileId);
  }
  if (excludeHidden) {
    exams = exams.filter((item) => !item.excluded);
  }
  return exams;
}

const DEMO_PROFILE_ID = 'profile_demo_default';

function createProfile(name, options) {
  const profiles = getProfiles();
  const id = options?.fixedId || `profile_${Date.now()}`;
  const isDemo = !!options?.isDemo;
  if (profiles.find((p) => p.id === id)) return id;
  profiles.push({
    id,
    name,
    isDemo,
    createdAt: new Date().toISOString()
  });
  saveProfiles(profiles);
  return id;
}

function updateProfile(id, name) {
  const profiles = getProfiles();
  const target = profiles.find((item) => item.id === id);
  if (target) {
    target.name = name;
    saveProfiles(profiles);
  }
}

function deleteProfile(id) {
  const profiles = getProfiles().filter((item) => item.id !== id);
  saveProfiles(profiles);
  saveExamsAll(getExamsAll().filter((item) => item.profileId !== id));
  if (getActiveProfileId() === id) {
    setActiveProfileId(profiles[0] ? profiles[0].id : '');
  }
  notifyChange({ type: 'profile-delete', profileId: id });
}

function setStorageSyncHooks(hooks) {
  _storageHooks = {
    onChange: hooks && typeof hooks.onChange === 'function' ? hooks.onChange : null,
    isSuppressed: hooks && typeof hooks.isSuppressed === 'function' ? hooks.isSuppressed : null
  };
}

function setSilentMode(silent) {
  _silentMode = !!silent;
}

function saveTrendMode(payload) {
  writeJSON(TREND_MODE_KEY, payload);
}

function getTrendMode() {
  return readJSON(TREND_MODE_KEY, {
    mode: 'score',
    rankType: 'class'
  });
}

function saveRadarSelection(payload) {
  writeJSON(RADAR_SELECTION_KEY, payload);
}

function getRadarSelection() {
  return readJSON(RADAR_SELECTION_KEY, {});
}

function migrateProfilesIfNeeded() {
  const profiles = getProfiles();
  const exams = getExamsAll();

  if (profiles.length === 0) {
    const defaultId = createProfile('人生档案', { fixedId: DEMO_PROFILE_ID, isDemo: true });
    if (exams.length > 0) {
      saveExamsAll(
        exams.map((item) => ({
          ...item,
          profileId: item.profileId || defaultId
        }))
      );
    }
    setActiveProfileId(defaultId);
    return;
  }

  if (!getActiveProfileId()) {
    setActiveProfileId(profiles[0].id);
  }

  const hasMissingProfileId = exams.some((item) => !item.profileId);
  if (hasMissingProfileId) {
    const fallbackId = getActiveProfileId() || profiles[0].id;
    saveExamsAll(
      exams.map((item) => ({
        ...item,
        profileId: item.profileId || fallbackId
      }))
    );
  }
}

function getFormMemoryAll() {
  return readJSON(FORM_MEMORY_KEY, {});
}

function saveFormMemoryAll(memory) {
  writeJSON(FORM_MEMORY_KEY, memory);
}

function getProfileMemory(profileId) {
  const memory = getFormMemoryAll();
  return memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
}

function rememberExamDefaults(profileId, payload) {
  if (!profileId || !payload) return;

  const memory = getFormMemoryAll();
  const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };
  const nextDefaults = { ...profileMemory.examDefaults };

  if (payload.classTotal) nextDefaults.classTotal = Number(payload.classTotal);
  if (payload.gradeTotal) nextDefaults.gradeTotal = Number(payload.gradeTotal);

  memory[profileId] = {
    ...profileMemory,
    examDefaults: nextDefaults
  };
  saveFormMemoryAll(memory);
}

function getRememberedExamDefaults(profileId) {
  return getProfileMemory(profileId).examDefaults || {};
}

function rememberSubjectFullScore(profileId, subjectName, fullScore) {
  const normalizedName = String(subjectName || '').trim();
  if (!profileId || !normalizedName || !fullScore) return;

  const memory = getFormMemoryAll();
  const profileMemory = memory[profileId] || { examDefaults: {}, subjectFullScores: {} };

  memory[profileId] = {
    ...profileMemory,
    subjectFullScores: {
      ...(profileMemory.subjectFullScores || {}),
      [normalizedName]: Number(fullScore)
    }
  };
  saveFormMemoryAll(memory);
}

function getRememberedSubjectFullScore(profileId, subjectName) {
  const normalizedName = String(subjectName || '').trim();
  if (!profileId || !normalizedName) return null;

  const remembered = getProfileMemory(profileId).subjectFullScores?.[normalizedName];
  return remembered ? Number(remembered) : null;
}

function setProfileMemory(profileId, profileMemory) {
  if (!profileId) return;
  const memory = getFormMemoryAll();
  memory[profileId] = {
    examDefaults: profileMemory?.examDefaults || {},
    subjectFullScores: profileMemory?.subjectFullScores || {}
  };
  saveFormMemoryAll(memory);
}

function estimateByteSize(value) {
  return JSON.stringify(value).length;
}

function getLocalProfileBundle(profileId) {
  const profiles = getProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return null;

  const exams = getExams(profileId);
  const formMemory = getProfileMemory(profileId);
  const bundle = {
    profile: { ...profile },
    exams: exams.map((exam) => ({ ...exam })),
    formMemory: {
      examDefaults: { ...(formMemory.examDefaults || {}) },
      subjectFullScores: { ...(formMemory.subjectFullScores || {}) }
    },
    exportedAt: new Date().toISOString()
  };

  return {
    profileId,
    profileName: profile.name,
    examCount: exams.length,
    dataSize: estimateByteSize(bundle),
    bundle
  };
}

function getAllLocalProfileBundles() {
  return getProfiles()
    .map((profile) => getLocalProfileBundle(profile.id))
    .filter(Boolean);
}

function getExamTimestamp(exam) {
  const value = exam?.updatedAt || exam?.createdAt || exam?.endDate || exam?.startDate || '1970-01-01T00:00:00.000Z';
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function mergeExamLists(localExams = [], cloudExams = []) {
  const examMap = new Map();

  localExams.forEach((exam) => {
    examMap.set(exam.id, { ...exam });
  });

  cloudExams.forEach((exam) => {
    const existing = examMap.get(exam.id);
    if (!existing || getExamTimestamp(exam) >= getExamTimestamp(existing)) {
      examMap.set(exam.id, { ...exam });
    }
  });

  return Array.from(examMap.values()).sort((a, b) => getExamTimestamp(b) - getExamTimestamp(a));
}

function applyCloudProfileBundle(cloudBundle) {
  const payload = cloudBundle?.profile_data || cloudBundle?.bundle || cloudBundle;
  if (!payload?.profile) {
    throw new Error('云端档案数据结构无效');
  }

  // 云端下来的示例档案不合并到本地
  if (payload.profile.isDemo) {
    return { skipped: true, reason: '示例档案不合并' };
  }

  const localProfiles = getProfiles();
  const localExams = getExamsAll();
  const incomingProfile = { ...payload.profile };
  const incomingExams = (payload.exams || []).map((exam) => ({ ...exam, profileId: incomingProfile.id }));
  const existingProfileIndex = localProfiles.findIndex((profile) => profile.id === incomingProfile.id);

  if (existingProfileIndex >= 0) {
    localProfiles[existingProfileIndex] = {
      ...localProfiles[existingProfileIndex],
      ...incomingProfile,
      name: incomingProfile.name || localProfiles[existingProfileIndex].name
    };
  } else {
    localProfiles.push(incomingProfile);
  }

  const otherExams = localExams.filter((exam) => exam.profileId !== incomingProfile.id);
  const mergedProfileExams = mergeExamLists(
    localExams.filter((exam) => exam.profileId === incomingProfile.id),
    incomingExams
  );

  saveProfiles(localProfiles);
  saveExamsAll(otherExams.concat(mergedProfileExams));
  setProfileMemory(incomingProfile.id, payload.formMemory || {});
}

module.exports = {
  EXAMS_KEY,
  PROFILES_KEY,
  ACTIVE_PROFILE_KEY,
  getProfiles,
  saveProfiles,
  getActiveProfileId,
  setActiveProfileId,
  getExams,
  getExamsAll,
  saveExamsAll,
  saveProfileExams,
  createProfile,
  updateProfile,
  deleteProfile,
  saveTrendMode,
  getTrendMode,
  saveRadarSelection,
  getRadarSelection,
  migrateProfilesIfNeeded,
  rememberExamDefaults,
  getRememberedExamDefaults,
  rememberSubjectFullScore,
  getRememberedSubjectFullScore,
  setProfileMemory,
  getLocalProfileBundle,
  getAllLocalProfileBundles,
  mergeExamLists,
  applyCloudProfileBundle,
  setStorageSyncHooks,
  setSilentMode
};
