<template>
  <div class="page-container">
    <header class="page-header">
      <h2>👥 사용자 관리</h2>
      <p class="page-description">사용자 계정을 생성하고 센서 프로젝트를 할당하세요</p>
      <button class="btn-primary" @click="showUserModal = true">
        + 새 사용자 추가
      </button>
    </header>

    <!-- 사용자 목록 -->
    <div v-if="loading" class="empty-state"><p>사용자 목록을 불러오는 중...</p></div>
    <div v-else class="user-list">
      <div v-if="users.length === 0" class="empty-state">
        <p>등록된 사용자가 없습니다</p>
      </div>

      <div v-for="user in users" :key="user.id" class="user-card">
        <!-- ── 1행: 기본 정보 ── -->
        <div class="user-row-main">
          <div class="user-identity">
            <div class="user-avatar">{{ user.name.charAt(0) }}</div>
            <div class="user-text">
              <span class="user-name">{{ user.name }}</span>
              <span class="user-username">@{{ user.username }}</span>
            </div>
          </div>

          <div class="user-meta">
            <span class="role-badge" :class="user.role">{{ roleLabel(user.role) }}</span>
            <span v-if="user.parentUserName" class="parent-badge">{{ user.parentUserName }}</span>
          </div>

          <div class="user-info-chips">
            <span v-if="user.address" class="info-chip">📍 {{ user.address }}</span>
            <span v-if="user.tuyaProject?.enabled && user.tuyaProject?.name" class="info-chip project">
              🔗 {{ user.tuyaProject.name }}
            </span>
            <span class="info-chip date">📅 {{ user.createdAt }}</span>
          </div>

          <span class="status-badge" :class="user.status">
            {{ user.status === 'active' ? '활성' : '비활성' }}
          </span>

          <div class="action-buttons">
            <button class="btn-icon" title="편집" @click="editUser(user)">✏️</button>
            <button class="btn-icon" title="Tuya 계정 관리" @click="openTuyaProjects(user)">☁️</button>
            <button class="btn-icon" title="센서 프로젝트 할당" @click="assignProject(user)">🔗</button>
            <button class="btn-icon danger" title="삭제" @click="deleteUser(user)">🗑️</button>
          </div>
        </div>

        <!-- ── 2행: 기능 설정 (farm_admin만) ── -->
        <div v-if="user.role === 'farm_admin'" class="user-row-features">
          <span class="features-label">기능 설정</span>
          <div class="feature-toggles">
            <!-- 생육관리 -->
            <div class="feature-toggle-item">
              <span class="feature-toggle-name">🌱 생육관리</span>
              <button
                class="toggle-btn"
                :class="{ on: cropFeatureMap[user.id] !== false }"
                @click="toggleUserCropFeature(user)"
                :title="cropFeatureMap[user.id] !== false ? '끄기' : '켜기'"
              >
                <span class="toggle-knob" />
              </button>
              <span class="toggle-state-label">{{ cropFeatureMap[user.id] !== false ? '켜짐' : '꺼짐' }}</span>
            </div>

            <!-- 향후 기능 추가 시 여기에 삽입 -->
          </div>
        </div>
      </div>
    </div>

    <!-- 사용자 추가/수정 모달 -->
    <UserFormModal
      :show="showUserModal"
      :user="selectedUser"
      @close="closeUserModal"
      @save="saveUser"
    />

    <!-- Tuya 프로젝트 할당 모달 -->
    <ProjectAssignModal
      :show="showProjectModal"
      :user="selectedUser"
      @close="showProjectModal = false"
      @assign="handleProjectAssign"
    />

    <!-- Tuya 다중 프로젝트 관리 모달 -->
    <TuyaProjectsModal
      :show="showTuyaProjectsModal"
      :target-user="selectedUser"
      @close="showTuyaProjectsModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UserFormModal from '@/components/admin/UserFormModal.vue'
import ProjectAssignModal from '@/components/admin/ProjectAssignModal.vue'
import TuyaProjectsModal from '@/components/admin/TuyaProjectsModal.vue'
import { userApi } from '../api/user.api'
import type { UpdateTuyaRequest } from '../api/user.api'
import { useAuthStore } from '../stores/auth.store'

interface User {
  id: string
  name: string
  username: string
  role: 'admin' | 'farm_admin' | 'farm_user'
  parentUserId?: string
  parentUserName?: string
  address?: string
  tuyaProject?: any
  createdAt: string
  status: 'active' | 'inactive'
}

function roleLabel(role: string): string {
  switch (role) {
    case 'admin': return '플랫폼 관리자'
    case 'farm_admin': return '농장 관리자'
    case 'farm_user': return '농장 사용자'
    default: return role
  }
}

const authStore = useAuthStore()
const users = ref<User[]>([])
const loading = ref(false)
// 사용자 ID → 생육관리 활성화 여부 (true = 켜짐, false = 꺼짐)
const cropFeatureMap = ref<Record<string, boolean>>({})

const showUserModal = ref(false)
const showProjectModal = ref(false)
const showTuyaProjectsModal = ref(false)
const selectedUser = ref<User | null>(null)

async function fetchUsers() {
  loading.value = true
  try {
    const [{ data }, featureMap] = await Promise.all([
      userApi.getAll(),
      fetchCropFeatureMap(),
    ])
    users.value = data as any
    cropFeatureMap.value = featureMap
  } catch (err) {
    console.error('사용자 목록 조회 실패:', err)
  } finally {
    loading.value = false
  }
}

async function fetchCropFeatureMap(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch('/api/crop-management/feature/all', {
      headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

async function toggleUserCropFeature(user: User) {
  const current = cropFeatureMap.value[user.id] !== false  // undefined도 true 취급
  const next = !current
  try {
    const res = await fetch(`/api/crop-management/feature/users/${user.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({ enabled: next }),
    })
    if (res.ok) {
      cropFeatureMap.value = { ...cropFeatureMap.value, [user.id]: next }
    }
  } catch (err) {
    console.error('생육관리 설정 변경 실패:', err)
  }
}

onMounted(() => {
  fetchUsers()
})

const editUser = (user: User) => {
  selectedUser.value = { ...user }
  showUserModal.value = true
}

const assignProject = (user: User) => {
  selectedUser.value = user
  showProjectModal.value = true
}

const openTuyaProjects = (user: User) => {
  selectedUser.value = user
  showTuyaProjectsModal.value = true
}

const deleteUser = async (user: User) => {
  if (!confirm(`${user.name} 사용자를 삭제하시겠습니까?`)) return
  try {
    await userApi.remove(user.id)
    users.value = users.value.filter(u => u.id !== user.id)
  } catch (err) {
    console.error('삭제 실패:', err)
    alert('삭제에 실패했습니다.')
  }
}

const closeUserModal = () => {
  showUserModal.value = false
  selectedUser.value = null
}

const saveUser = async (userData: any) => {
  try {
    if (selectedUser.value) {
      const payload: any = { name: userData.name, address: userData.address }
      if (userData.role) payload.role = userData.role
      if (userData.status) payload.status = userData.status
      if (userData.password) payload.password = userData.password
      if (userData.parentUserId !== undefined) payload.parentUserId = userData.parentUserId || null

      // 자기 자신이면 /users/me, 아니면 관리자 경로
      if (selectedUser.value.id === authStore.user?.id) {
        await userApi.updateMe(payload)
        await authStore.fetchUser()
      } else {
        await userApi.update(selectedUser.value.id, payload)
      }

      // Tuya 프로젝트 정보가 있으면 함께 업데이트 (farm_user는 parent 것을 사용하므로 제외)
      if (userData.role !== 'farm_user' && userData.tuyaProject?.name && userData.tuyaProject?.accessId && userData.tuyaProject?.endpoint) {
        const tuyaPayload: UpdateTuyaRequest = {
          name: userData.tuyaProject.name,
          accessId: userData.tuyaProject.accessId,
          accessSecret: userData.tuyaProject.accessSecret || '',
          endpoint: userData.tuyaProject.endpoint,
          projectId: userData.tuyaProject.projectId,
          enabled: userData.tuyaProject.enabled ?? true,
        }
        if (selectedUser.value.id === authStore.user?.id) {
          await userApi.updateMyTuya(tuyaPayload)
        } else {
          await userApi.updateTuya(selectedUser.value.id, tuyaPayload)
        }
      }

      await fetchUsers()
    } else {
      // 신규 추가
      const { data: newUser } = await userApi.create({
        username: userData.username,
        password: userData.password,
        name: userData.name,
        role: userData.role || 'farm_admin',
        address: userData.address,
        parentUserId: userData.parentUserId,
      })

      // 신규 사용자의 Tuya 프로젝트 정보 저장
      if (userData.role !== 'farm_user' && userData.tuyaProject?.name && userData.tuyaProject?.accessId && userData.tuyaProject?.endpoint) {
        const tuyaPayload: UpdateTuyaRequest = {
          name: userData.tuyaProject.name,
          accessId: userData.tuyaProject.accessId,
          accessSecret: userData.tuyaProject.accessSecret || '',
          endpoint: userData.tuyaProject.endpoint,
          projectId: userData.tuyaProject.projectId,
          enabled: userData.tuyaProject.enabled ?? true,
        }
        await userApi.updateTuya((newUser as any).id, tuyaPayload)
      }

      await fetchUsers()
    }
    closeUserModal()
  } catch (err: any) {
    console.error('저장 실패:', err)
    alert(err.response?.data?.message || '저장에 실패했습니다.')
  }
}

const handleProjectAssign = async (project: any) => {
  if (!selectedUser.value) return
  try {
    const tuyaPayload: UpdateTuyaRequest = {
      name: project.name || '',
      accessId: project.accessId || '',
      accessSecret: project.accessSecret || '',
      endpoint: project.endpoint || '',
      projectId: project.projectId,
    }
    if (selectedUser.value.id === authStore.user?.id) {
      await userApi.updateMyTuya(tuyaPayload)
    } else {
      await userApi.updateTuya(selectedUser.value.id, tuyaPayload)
    }
    await fetchUsers()
  } catch (err) {
    console.error('프로젝트 할당 실패:', err)
    alert('프로젝트 할당에 실패했습니다.')
  }
  showProjectModal.value = false
}
</script>

<style scoped>
.page-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.page-header h2 {
  font-size: var(--font-size-display);
  font-weight: 700;
  color: var(--text-primary);
}

.page-description {
  flex: 1;
  color: var(--text-link);
  font-size: var(--font-size-label);
}

.btn-primary {
  padding: 10px 20px;
  background: #2e7d32;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #256029;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(46, 125, 50, 0.3);
}

/* ── 카드 목록 ── */
.user-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-card {
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  border: 1px solid var(--border-light);
}

/* ── 1행: 기본 정보 ── */
.user-row-main {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  flex-wrap: wrap;
}

.user-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 160px;
}

.user-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 600;
  font-size: var(--font-size-body);
  color: var(--text-primary);
}

.user-username {
  font-size: var(--font-size-caption);
  color: var(--text-muted);
}

.user-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.user-info-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.info-chip {
  font-size: var(--font-size-caption);
  color: var(--text-secondary);
  background: var(--bg-hover);
  padding: 3px 8px;
  border-radius: 8px;
  white-space: nowrap;
}

.info-chip.project {
  background: #e8f5e9;
  color: #2e7d32;
}

.info-chip.date {
  color: var(--text-muted);
}

/* ── 2행: 기능 설정 ── */
.user-row-features {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-light);
  flex-wrap: wrap;
}

.features-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
  flex-shrink: 0;
}

.feature-toggles {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: center;
}

.feature-toggle-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.feature-toggle-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}

.toggle-btn {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--border-color, #ccc);
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  padding: 0;
  flex-shrink: 0;
}

.toggle-btn.on {
  background: #4caf50;
}

.toggle-btn .toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.toggle-btn.on .toggle-knob {
  transform: translateX(18px);
}

.toggle-state-label {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 28px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: var(--font-size-label);
}

.role-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: var(--font-size-caption);
  font-weight: 500;
  white-space: nowrap;
}

.role-badge.admin {
  background: #e3f2fd;
  color: #1976d2;
}

.role-badge.farm_admin {
  background: #fff3e0;
  color: #e65100;
}

.role-badge.farm_user {
  background: #e8f5e9;
  color: #2e7d32;
}

.parent-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: var(--font-size-tiny);
  background: var(--bg-badge);
  color: var(--text-muted);
}

.text-muted {
  color: var(--text-muted);
  font-style: italic;
  font-size: var(--font-size-caption);
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: var(--font-size-caption);
  font-weight: 500;
  white-space: nowrap;
}

.status-badge.active {
  background: #e8f5e9;
  color: #2e7d32;
}

.status-badge.inactive {
  background: #ffebee;
  color: #c62828;
}


.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-icon {
  background: none;
  border: none;
  font-size: var(--font-size-subtitle);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  transition: all 0.2s;
}

.btn-icon:hover {
  background: var(--bg-hover);
}

.btn-icon.danger:hover {
  background: #ffebee;
}

.empty-state {
  padding: 60px 20px;
  text-align: center;
}

.empty-state p {
  color: var(--text-muted);
  font-size: var(--font-size-body);
}

@media (max-width: 1024px) {
  .users-table-container {
    overflow-x: auto;
  }

  .users-table {
    min-width: 1100px;
  }
}
</style>
