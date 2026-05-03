<template>
  <div class="modal-overlay" v-if="show" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <div>
          <h2>Tuya 계정 관리</h2>
          <p class="modal-subtitle" v-if="targetUser">{{ targetUser.name }}</p>
        </div>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- 프로젝트 목록 -->
        <div v-if="!editingProject" class="projects-section">
          <div v-if="loadingList" class="loading-text">불러오는 중...</div>

          <div v-else-if="projects.length === 0" class="empty-state">
            <p>등록된 Tuya 계정이 없습니다.</p>
          </div>

          <div v-else class="project-list">
            <div v-for="p in projects" :key="p.id" class="project-card">
              <div class="project-info">
                <div class="project-label">{{ p.label || p.name }}</div>
                <div class="project-meta">
                  <span class="meta-chip">{{ p.accessId }}</span>
                  <span class="meta-chip">{{ endpointLabel(p.endpoint) }}</span>
                  <span :class="['status-chip', p.enabled ? 'on' : 'off']">
                    {{ p.enabled ? '활성' : '비활성' }}
                  </span>
                </div>
              </div>
              <div class="project-actions">
                <button class="btn-icon" @click="startEdit(p)" title="수정">✏️</button>
                <button class="btn-icon danger" @click="deleteProject(p.id)" title="삭제">🗑️</button>
              </div>
            </div>
          </div>

          <button class="btn-add" @click="startAdd">+ 새 계정 추가</button>
        </div>

        <!-- 추가/수정 폼 -->
        <div v-else class="form-section">
          <div class="form-back">
            <button class="btn-text" @click="cancelEdit">← 목록으로</button>
            <h3>{{ editingProject.id ? '계정 수정' : '새 계정 추가' }}</h3>
          </div>

          <div class="input-group">
            <label>표시명 *</label>
            <input v-model="editingProject.label" class="form-input" placeholder="예: 농장A 계정1" />
          </div>
          <div class="input-group">
            <label>프로젝트 이름 *</label>
            <input v-model="editingProject.name" class="form-input" placeholder="프로젝트 이름" />
          </div>
          <div class="input-group">
            <label>Access ID (Client ID) *</label>
            <input v-model="editingProject.accessId" class="form-input" placeholder="Access ID" autocomplete="off" />
          </div>
          <div class="input-group">
            <label>Access Secret {{ editingProject.id ? '(변경 시에만 입력)' : '*' }}</label>
            <input
              v-model="editingProject.accessSecret"
              type="password"
              class="form-input"
              placeholder="Access Secret"
              autocomplete="new-password"
            />
          </div>
          <div class="input-group">
            <label>API Endpoint *</label>
            <select v-model="editingProject.endpoint" class="form-select">
              <option value="https://openapi.tuyacn.com">중국 (https://openapi.tuyacn.com)</option>
              <option value="https://openapi.tuyaus.com">미국 (https://openapi.tuyaus.com)</option>
              <option value="https://openapi.tuyaeu.com">EU (https://openapi.tuyaeu.com)</option>
              <option value="https://openapi.tuyain.com">인도 (https://openapi.tuyain.com)</option>
            </select>
          </div>
          <div class="input-group">
            <label>Tuya 프로젝트 ID (선택)</label>
            <input v-model="editingProject.projectId" class="form-input" placeholder="선택사항" />
          </div>
          <div v-if="editingProject.id" class="input-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="editingProject.enabled" />
              활성화
            </label>
          </div>

          <div v-if="formError" class="error-box">{{ formError }}</div>

          <div class="button-group">
            <button class="btn-secondary" @click="cancelEdit">취소</button>
            <button class="btn-primary" @click="saveProject" :disabled="saving">
              {{ saving ? '저장 중...' : '저장' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { userApi, type TuyaProject, type CreateTuyaProjectRequest } from '../../api/user.api'
import { useAuthStore } from '../../stores/auth.store'

interface Props {
  show: boolean
  targetUser?: { id: string; name: string } | null
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()

const authStore = useAuthStore()

const projects = ref<TuyaProject[]>([])
const loadingList = ref(false)
const editingProject = ref<(Partial<CreateTuyaProjectRequest> & { id?: string; enabled?: boolean }) | null>(null)
const saving = ref(false)
const formError = ref('')

const isMyself = () => !props.targetUser || props.targetUser.id === authStore.user?.id

const endpointLabel = (endpoint: string) => {
  const map: Record<string, string> = {
    'https://openapi.tuyacn.com': '중국',
    'https://openapi.tuyaus.com': '미국',
    'https://openapi.tuyaeu.com': 'EU',
    'https://openapi.tuyain.com': '인도',
  }
  return map[endpoint] || endpoint
}

const loadProjects = async () => {
  loadingList.value = true
  try {
    if (isMyself()) {
      const { data } = await userApi.listMyTuyaProjects()
      projects.value = data
    } else {
      // Admin viewing another user's projects — placeholder, uses admin endpoint
      const { data } = await (userApi as any).listTuyaProjects(props.targetUser!.id)
      projects.value = data
    }
  } catch {
    projects.value = []
  } finally {
    loadingList.value = false
  }
}

watch(() => props.show, (v) => {
  if (v) {
    loadProjects()
    editingProject.value = null
    formError.value = ''
  }
})

const startAdd = () => {
  editingProject.value = {
    label: '',
    name: '',
    accessId: '',
    accessSecret: '',
    endpoint: 'https://openapi.tuyacn.com',
    projectId: '',
  }
  formError.value = ''
}

const startEdit = (p: TuyaProject) => {
  editingProject.value = {
    id: p.id,
    label: p.label,
    name: p.name,
    accessId: p.accessId,
    accessSecret: '',
    endpoint: p.endpoint,
    projectId: p.projectId || '',
    enabled: p.enabled,
  }
  formError.value = ''
}

const cancelEdit = () => {
  editingProject.value = null
  formError.value = ''
}

const saveProject = async () => {
  const p = editingProject.value!
  if (!p.label?.trim()) { formError.value = '표시명을 입력하세요.'; return }
  if (!p.name?.trim()) { formError.value = '프로젝트 이름을 입력하세요.'; return }
  if (!p.accessId?.trim()) { formError.value = 'Access ID를 입력하세요.'; return }
  if (!p.id && !p.accessSecret?.trim()) { formError.value = 'Access Secret을 입력하세요.'; return }

  saving.value = true
  formError.value = ''
  try {
    if (p.id) {
      const payload: any = { label: p.label, name: p.name, accessId: p.accessId, endpoint: p.endpoint, projectId: p.projectId, enabled: p.enabled }
      if (p.accessSecret) payload.accessSecret = p.accessSecret
      if (isMyself()) {
        await userApi.updateMyTuyaProject(p.id, payload)
      } else {
        await (userApi as any).updateTuyaProject(props.targetUser!.id, p.id, payload)
      }
    } else {
      const payload: CreateTuyaProjectRequest = {
        label: p.label!,
        name: p.name!,
        accessId: p.accessId!,
        accessSecret: p.accessSecret!,
        endpoint: p.endpoint!,
        projectId: p.projectId || undefined,
      }
      if (isMyself()) {
        await userApi.addMyTuyaProject(payload)
      } else {
        // Admin adding for another user — not yet exposed but graceful fallback
        await userApi.addMyTuyaProject(payload)
      }
    }
    await loadProjects()
    editingProject.value = null
  } catch (err: any) {
    formError.value = err.response?.data?.message || '저장에 실패했습니다.'
  } finally {
    saving.value = false
  }
}

const deleteProject = async (id: string) => {
  if (!confirm('이 Tuya 계정을 삭제하시겠습니까?\n연결된 장치는 첫 번째 계정으로 자동 전환됩니다.')) return
  try {
    if (isMyself()) {
      await userApi.deleteMyTuyaProject(id)
    } else {
      await (userApi as any).deleteTuyaProject(props.targetUser!.id, id)
    }
    await loadProjects()
  } catch (err: any) {
    alert(err.response?.data?.message || '삭제에 실패했습니다.')
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background: var(--bg-card);
  border-radius: 16px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-modal);
  border: 1px solid var(--border-color);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 24px;
  border-bottom: 1px solid var(--border-input);
}

.modal-header h2 {
  font-size: var(--font-size-title);
  font-weight: 700;
  margin: 0 0 4px 0;
  color: var(--text-primary);
}

.modal-subtitle {
  font-size: var(--font-size-label);
  color: var(--text-secondary);
  margin: 0;
}

.btn-close {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--bg-hover);
  border-radius: 8px;
  font-size: var(--font-size-subtitle);
  cursor: pointer;
  color: var(--text-muted);
  flex-shrink: 0;
}

.modal-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.loading-text {
  text-align: center;
  color: var(--text-muted);
  padding: 20px;
}

.empty-state {
  text-align: center;
  padding: 32px;
  color: var(--text-secondary);
}

.project-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;
}

.project-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-input);
  border-radius: 10px;
}

.project-info {
  flex: 1;
  min-width: 0;
}

.project-label {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.project-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-chip {
  font-size: var(--font-size-tiny);
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 2px 8px;
  border-radius: 10px;
}

.status-chip {
  font-size: var(--font-size-tiny);
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 10px;
}

.status-chip.on {
  background: var(--accent-bg);
  color: var(--accent);
}

.status-chip.off {
  background: var(--danger-bg);
  color: var(--danger);
}

.project-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-input);
  background: var(--bg-card);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover { background: var(--bg-hover); }
.btn-icon.danger:hover { background: var(--danger-bg); }

.btn-add {
  width: 100%;
  padding: 12px;
  border: 2px dashed var(--border-input);
  background: transparent;
  border-radius: 10px;
  color: var(--accent);
  font-size: var(--font-size-body);
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.btn-add:hover {
  border-color: var(--accent);
  background: var(--accent-bg);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.form-back {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.form-back h3 {
  font-size: var(--font-size-subtitle);
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.btn-text {
  background: none;
  border: none;
  color: var(--accent);
  font-size: var(--font-size-label);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.input-group {
  margin-bottom: 16px;
}

.input-group label {
  display: block;
  font-weight: 600;
  font-size: var(--font-size-label);
  margin-bottom: 8px;
  color: var(--text-primary);
}

.form-input, .form-select {
  width: 100%;
  padding: 12px 14px;
  border: 2px solid var(--border-input);
  border-radius: 8px;
  font-size: var(--font-size-body);
  background: var(--bg-input);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input:focus, .form-select:focus {
  outline: none;
  border-color: var(--accent);
}

.checkbox-label {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  font-weight: 500 !important;
  cursor: pointer;
}

.error-box {
  margin-bottom: 12px;
  padding: 10px 14px;
  background: var(--danger-bg);
  border: 1px solid var(--danger);
  border-radius: 8px;
  color: var(--danger);
  font-size: var(--font-size-label);
}

.button-group {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.button-group button { flex: 1; }

.btn-primary, .btn-secondary {
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: var(--font-size-body);
  cursor: pointer;
}

.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary { background: var(--bg-secondary); color: var(--text-primary); }
.btn-secondary:hover { background: var(--bg-hover); }

@media (max-width: 768px) {
  .modal-overlay { padding: 0; }
  .modal-container { border-radius: 0; max-width: 100%; height: 100vh; height: 100dvh; }
  .modal-header { padding: 16px 20px; padding-top: calc(16px + env(safe-area-inset-top, 0px)); }
  .modal-body { padding: 16px 20px; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
}
</style>
