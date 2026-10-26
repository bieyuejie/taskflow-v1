<template>
  <div class="login-container">
    <el-card class="login-card">
      <h2 class="title">TaskFlow</h2>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="0">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="请输入账号" />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" class="btn" :loading="loading" @click="onSubmit">
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <p class="tip">演示环境，任意账号密码均可登录</p>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../stores/user';

const router = useRouter();
const userStore = useUserStore();

const formRef = ref();
const loading = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

const onSubmit = async () => {
  try {
    await formRef.value.validate();
    loading.value = true;

    await userStore.login(form);

    ElMessage.success('登录成功');
    await router.push('/task-list');
  } catch {
    return;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 16px;
}
.login-card {
  width: 100%;
  max-width: 360px;
}
.title {
  text-align: center;
  margin: 0 0 24px;
}
.btn {
  width: 100%;
}
.tip {
  text-align: center;
  color: #999;
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
