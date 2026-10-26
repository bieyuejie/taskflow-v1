<template>
  <el-dialog
    :title="task ? '编辑任务' : '新增任务'"
    :model-value="visible"
    width="min(560px, calc(100vw - 32px))"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules">
      <el-form-item label="标题" prop="title">
        <el-input v-model="form.title" />
      </el-form-item>

      <el-form-item label="描述" prop="desc">
        <el-input v-model="form.desc" type="textarea" />
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
    </el-form>

    <template #footer>
      <el-button :disabled="submitting" @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';

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
});

const emit = defineEmits(['submit', 'close']);

const formRef = ref();
const form = reactive({
  title: '',
  desc: '',
  status: 'todo',
  priority: 'low',
});

const rules = {
  title: [{ required: true, whitespace: true, message: '请输入标题', trigger: 'blur' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
};

const resetForm = () => {
  Object.assign(form, {
    title: '',
    desc: '',
    status: 'todo',
    priority: 'low',
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
      });
      formRef.value?.clearValidate();
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

const handleClose = () => {
  emit('close');
};

const handleSubmit = async () => {
  if (props.submitting) return;
  const isValid = await formRef.value.validate().catch(() => false);
  if (!isValid) return;

  emit('submit', { ...form, title: form.title.trim() });
};
</script>
