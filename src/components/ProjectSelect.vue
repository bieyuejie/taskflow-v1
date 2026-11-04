<template>
  <el-select
    :model-value="modelValue"
    :disabled="disabled"
    :loading="loading"
    :empty-values="showAll ? [null, undefined] : ['', null, undefined]"
    placeholder="请选择项目"
    class="project-select"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-option v-if="showAll" label="全部项目" value="" />

    <el-option
      v-for="project in projects"
      :key="project.id"
      :label="project.name"
      :value="project.id"
    />
  </el-select>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: '' },
  projects: { type: Array, default: () => [] },
  showAll: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);
</script>

<style scoped>
.project-select {
  width: 100%;
  max-width: 240px;
}
</style>
