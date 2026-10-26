import * as echarts from 'echarts';

// 组件传入模板 ref，图表接入及尺寸监听封装在工具层。
export function createStatsCharts(pieElement, barElement) {
  const pieChart = echarts.init(pieElement);
  const barChart = echarts.init(barElement);
  const observer = new ResizeObserver(() => {
    pieChart.resize();
    barChart.resize();
  });
  observer.observe(pieElement);
  observer.observe(barElement);
  return {
    update(statusCounts, priorityCounts) {
      pieChart.setOption({
        title: { text: '任务状态分布', left: 'center' },
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{ type: 'pie', radius: '60%', data: statusCounts }],
      });
      barChart.setOption({
        title: { text: '任务优先级分布', left: 'center' },
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: ['低', '中', '高'] },
        yAxis: { type: 'value', minInterval: 1 },
        series: [{ type: 'bar', data: priorityCounts }],
      });
    },
    dispose() {
      observer.disconnect();
      pieChart.dispose();
      barChart.dispose();
    },
  };
}
