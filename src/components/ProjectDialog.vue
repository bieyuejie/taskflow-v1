<template>
  <el-dialog
    :title="project ? '编辑项目' : '新增项目'"
    :model-value="visible"
    width="min(560px, calc(100vw - 32px))"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @close="handleClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" :disabled="submitting" label-position="top">
      <el-form-item label="项目名称" prop="name">
        <el-input v-model="form.name" maxlength="50" show-word-limit />
      </el-form-item>

      <el-form-item label="项目描述" prop="desc">
        <el-input v-model="form.desc" type="textarea" maxlength="500" show-word-limit />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="submitting" @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit"> 保存 </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref, watch } from 'vue';

const props = defineProps({
  visible: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  project: { type: Object, default: null },
});

const emit = defineEmits(['submit', 'close']);
const formRef = ref();
const validating = ref(false);
const form = reactive({ name: '', desc: '' });

const rules = {
  name: [
    { required: true, whitespace: true, message: '请输入项目名称', trigger: 'blur' },
    { max: 50, message: '项目名称最多50个字符', trigger: 'blur' },
  ],
  desc: [{ max: 500, message: '项目描述最多500个字符', trigger: 'blur' }],
};

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    form.name = props.project?.name ?? '';
    form.desc = props.project?.desc ?? '';
    formRef.value?.clearValidate();
  }
);

function handleClose() {
  if (!props.submitting) emit('close');
}

async function handleSubmit() {
  if (props.submitting || validating.value) return;
  validating.value = true;
  try {
    const valid = await formRef.value.validate().catch(() => false);
    if (!valid || !props.visible) return;
    emit('submit', { name: form.name.trim(), desc: form.desc });
  } finally {
    validating.value = false;
  }
}
</script>
