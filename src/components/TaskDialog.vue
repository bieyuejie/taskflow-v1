<template>
  <el-dialog
    :title="task ? '编辑任务' : '新增任务'"
    :model-value="visible"
    width="min(560px, calc(100vw - 32px))"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="busy">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" maxlength="100" show-word-limit />
      </el-form-item>

      <el-form-item label="描述" prop="desc">
        <el-input v-model="form.desc" type="textarea" maxlength="2000" show-word-limit />
      </el-form-item>

      <el-form-item label="所属项目" prop="projectId">
        <ProjectSelect
          v-model="form.projectId"
          :projects="projects"
          :show-all="false"
          :disabled="task !== null || busy"
        />
      </el-form-item>

      <el-form-item label="状态" prop="status">
        <el-select v-model="form.status">
          <el-option label="待办" value="todo" />
          <el-option label="进行中" value="doing" />
          <el-option label="已完成" value="done" />
        </el-select>
      </el-form-item>

      <el-form-item label="优先级" prop="priority">
        <el-select v-model="form.priority">
          <el-option label="低" value="low" />
          <el-option label="中" value="medium" />
          <el-option label="高" value="high" />
        </el-select>
      </el-form-item>
      <el-form-item label="截止日期" prop="dueDate">
        <el-date-picker
          v-model="pickerDate"
          type="date"
          format="YYYY-MM-DD"
          placeholder="选择截止日期（可选）"
          :editable="false"
          :disabled-date="(date) => date.getFullYear() < 1 || date.getFullYear() > 9999"
          clearable
          class="date-input"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="busy" @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="busy" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import ProjectSelect from './ProjectSelect.vue';
import { getLocalDate, isDueDate, toLocalDate } from '../utils/date';

const props = defineProps({
  submitting: { type: Boolean, default: false },
  visible: {
    type: Boolean,
    default: false,
  },
  task: {
    type: Object,
    default: null,
  },
  projects: { type: Array, default: () => [] },
  defaultProjectId: { type: String, default: '' },
});

const emit = defineEmits(['submit', 'close']);

const formRef = ref();
const validating = ref(false);
const busy = computed(() => props.submitting || validating.value);
const form = reactive({
  title: '',
  desc: '',
  status: 'todo',
  priority: 'low',
  projectId: '',
  dueDate: null,
});
const pickerDate = computed({
  get: () => toLocalDate(form.dueDate),
  set: (value) => {
    form.dueDate = value == null ? null : getLocalDate(value);
  },
});

const rules = {
  title: [
    { required: true, whitespace: true, message: '请输入标题', trigger: 'blur' },
    { max: 100, message: '标题不能超过 100 个字符', trigger: 'blur' },
  ],
  desc: [{ max: 2000, message: '描述不能超过 2000 个字符', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  projectId: [{ required: true, message: '请选择项目', trigger: 'change' }],
  dueDate: [
    {
      validator: (_rule, value, callback) =>
        callback(isDueDate(value) ? undefined : new Error('请选择有效的截止日期')),
      trigger: 'change',
    },
  ],
};

const resetForm = () => {
  Object.assign(form, {
    title: '',
    desc: '',
    status: 'todo',
    priority: 'low',
    projectId: props.defaultProjectId || props.projects[0]?.id || '',
    dueDate: null,
  });
  formRef.value?.clearValidate();
};

watch(
  () => [props.visible, props.task],
  ([visible, task]) => {
    if (!visible) return;

    if (task) {
      Object.assign(form, {
        title: task.title,
        desc: task.desc,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        dueDate: task.dueDate,
      });
      formRef.value?.clearValidate();
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

const handleClose = () => {
  if (!busy.value) emit('close');
};

const handleSubmit = async () => {
  if (busy.value) return;
  validating.value = true;
  try {
    const isValid = await formRef.value.validate().catch(() => false);
    if (!isValid || !props.visible) return;
    emit('submit', { ...form, title: form.title.trim() });
  } finally {
    validating.value = false;
  }
};
</script>

<style scoped>
.date-input {
  width: 100%;
}
</style>
