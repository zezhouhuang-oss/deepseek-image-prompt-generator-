// 状态管理
let currentImage = null;
let analysisMode = 'local'; // 'local' 或 'api'
let analysisResults = {};
let aiModel = null;

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initFileUpload();
    loadHistory();
    initLocalAI();
    showNotification('欢迎使用图片分析工具！', 'info');
});

// 初始化文件上传
function initFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    
    // 点击上传区域
    uploadArea.addEventListener('click', () => fileInput.click());
    
    // 文件选择
    fileInput.addEventListener('change', handleFileSelect);
    
    // 拖放功能
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#4f46e5';
        uploadArea.style.background = '#e0e7ff';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#cbd5e1';
        uploadArea.style.background = '#f8fafc';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#cbd5e1';
        uploadArea.style.background = '#f8fafc';
        
        if (e.dataTransfer.files.length) {
            handleImageFile(e.dataTransfer.files[0]);
        }
    });
}

// 初始化本地AI模型
async function initLocalAI() {
    try {
        showNotification('正在加载本地AI模型...', 'info');
        aiModel = await mobilenet.load({
            version: 2,
            alpha: 1.0
        });
        showNotification('本地AI模型加载成功！', 'success');
    } catch (error) {
        console.error('AI模型加载失败:', error);
        showNotification('本地AI模型加载失败，将使用云端分析', 'warning');
        analysisMode = 'api';
        document.querySelector('[data-mode="api"]').classList.add('active');
        document.querySelector('[data-mode="local"]').classList.remove('active');
    }
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) handleImageFile(file);
}

// 处理图片文件
async function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showNotification('请选择图片文件！', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showNotification('图片大小不能超过10MB！', 'error');
        return;
    }
    
    try {
        const imageUrl = URL.createObjectURL(file);
        const img = new Image();
        
        img.onload = () => {
            currentImage = img;
            displayImagePreview(imageUrl);
            document.getElementById('uploadArea').style.display = 'none';
            document.querySelector('.image-preview-container').style.display = 'block';
        };
        
        img.src = imageUrl;
        
        showNotification('图片上传成功！', 'success');
    } catch (error) {
        console.error('图片加载失败:', error);
        showNotification('图片加载失败，请重试', 'error');
    }
}

// 显示图片预览
function displayImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    preview.src = url;
}

// 设置分析模式
function setMode(mode) {
    analysisMode = mode;
    
    // 更新按钮状态
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    
    // 更新描述
    const desc = document.getElementById('modeDesc');
    if (mode === 'local') {
        desc.textContent = '本地分析使用浏览器内的AI模型，完全保护隐私';
    } else {
        desc.textContent = '云端分析使用更强大的AI模型，识别更准确';
    }
}

// 分析图片
async function analyzeImage() {
    if (!currentImage) {
        showNotification('请先上传图片！', 'warning');
        return;
    }
    
    // 禁用分析按钮
    const analyzeBtn = document.getElementById('analyzeBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分析中...';
    
    // 显示进度
    document.getElementById('progressSection').style.display = 'block';
    updateProgress(30, '加载AI模型...');
    
    try {
        if (analysisMode === 'local') {
            await analyzeWithLocalAI();
        } else {
            await analyzeWithCloudAPI();
        }
        
        showNotification('图片分析完成！', 'success');
        generatePrompt();
    } catch (error) {
        console.error('分析失败:', error);
        showNotification('分析失败，请重试', 'error');
    } finally {
        // 恢复按钮状态
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<i class="fas fa-search"></i> AI分析图片';
        document.getElementById('progressSection').style.display = 'none';
    }
}

// 使用本地AI分析
async function analyzeWithLocalAI() {
    if (!aiModel) {
        throw new Error('AI模型未加载');
    }
    
    updateProgress(50, '识别物体...');
    
    // 使用MobileNet进行图像分类
    const predictions = await aiModel.classify(currentImage, 10);
    
    updateProgress(80, '处理结果...');
    
    // 提取分析结果
    const objects = predictions.map(p => ({
        name: p.className.split(',')[0].trim(),
        confidence: Math.round(p.probability * 100)
    }));
    
    // 提取颜色信息（简化版）
    const colors = extractColorsFromImage();
    
    analysisResults = {
        objects: objects,
        colors: colors,
        tags: predictions.map(p => p.className.split(',').map(t => t.trim())).flat(),
        dominantColors: colors.slice(0, 3),
        detectedCount: objects.length
    };
    
    displayAnalysisResults();
}

// 使用云端API分析
async function analyzeWithCloudAPI() {
    updateProgress(40, '上传图片到云端...');
    
    try {
        // 将图片转换为base64
        const base64Image = await imageToBase64(currentImage);
        
        updateProgress(60, '调用AI分析API...');
        
        // 调用Vercel函数（我们稍后会创建）
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: base64Image.split(',')[1] // 移除data:image前缀
            })
        });
        
        if (!response.ok) {
            throw new Error('API调用失败');
        }
        
        updateProgress(80, '处理分析结果...');
        
        const result = await response.json();
        analysisResults = result;
        
        displayAnalysisResults();
    } catch (error) {
        console.error('云端分析失败:', error);
        // 失败时回退到本地分析
        showNotification('云端分析失败，尝试本地分析...', 'warning');
        await analyzeWithLocalAI();
    }
}

// 提取图片颜色（简化版）
function extractColorsFromImage() {
    // 这里简化处理，实际可以使用更复杂的颜色提取算法
    const colorPalettes = {
        landscape: ['#4ade80', '#22d3ee', '#3b82f6', '#a855f7'],
        portrait: ['#fbbf24', '#fb923c', '#dc2626', '#9333ea'],
        city: ['#6b7280', '#374151', '#1e40af', '#0ea5e9'],
        nature: ['#16a34a', '#15803d', '#65a30d', '#ca8a04']
    };
    
    return colorPalettes.landscape; // 简化为返回风景调色板
}

// 显示分析结果
function displayAnalysisResults() {
    const container = document.getElementById('resultsContainer');
    
    if (!analysisResults.objects || analysisResults.objects.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>未检测到显著物体，请尝试其他图片</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    // 物体识别结果
    html += `
        <div class="result-item">
            <span class="result-category">🔍 检测到的物体</span>
            <div class="result-content">
                ${analysisResults.objects.map(obj => 
                    `<span class="result-tag">${obj.name} (${obj.confidence}%)</span>`
                ).join('')}
            </div>
        </div>
    `;
    
    // 颜色分析
    if (analysisResults.colors && analysisResults.colors.length > 0) {
        html += `
            <div class="result-item">
                <span class="result-category">🎨 主要颜色</span>
                <div class="result-content">
                    ${analysisResults.colors.map(color => `
                        <span class="result-tag" style="background: ${color}; color: white;">
                            ${color}
                        </span>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // 标签
    if (analysisResults.tags && analysisResults.tags.length > 0) {
        html += `
            <div class="result-item">
                <span class="result-category">🏷️ 相关标签</span>
                <div class="result-content">
                    ${analysisResults.tags.slice(0, 10).map(tag => 
                        `<span class="result-tag">${tag}</span>`
                    ).join('')}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
}

// 生成提示词
function generatePrompt() {
    if (!analysisResults.objects || analysisResults.objects.length === 0) {
        showNotification('请先分析图片！', 'warning');
        return;
    }
    
    const style = document.getElementById('styleSelect').value;
    const prompt = buildAIPrompt(style);
    
    document.getElementById('promptOutput').value = prompt;
}

// 构建AI提示词
function buildAIPrompt(style) {
    const objects = analysisResults.objects.map(obj => obj.name).slice(0, 5);
    const colors = analysisResults.colors ? analysisResults.colors.slice(0, 3) : [];
    
    const stylePrompts = {
        photorealistic: "photorealistic, hyperdetailed, 8K, ultra realistic, detailed textures",
        anime: "anime style, vibrant colors, cel shading, Japanese animation, stylized",
        oil_painting: "oil painting, brush strokes, canvas texture, classical art, masterpiece",
        digital_art: "digital art, concept art, trending on artstation, detailed illustration",
        minimalist: "minimalist, clean lines, simple composition, modern art, elegant",
        cinematic: "cinematic, dramatic lighting, film still, movie scene, professional photography"
    };
    
    const qualityPrompts = [
        "masterpiece, best quality, ultra detailed",
        "intricate details, sharp focus, professional",
        "award winning, high resolution, 8K"
    ];
    
    const modifiers = [
        "beautiful", "stunning", "epic", "breathtaking",
        "serene", "vibrant", "majestic", "dramatic"
    ];
    
    // 随机选择修饰词
    const selectedModifiers = modifiers
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);
    
    const prompt = `${selectedModifiers.join(', ')} ${objects.join(', ')}
${stylePrompts[style]}
${qualityPrompts[Math.floor(Math.random() * qualityPrompts.length)]}
${colors.length > 0 ? 'color scheme: ' + colors.join(', ') + '' : ''}
--ar 16:9 --v 5.2 --style raw`;

    return prompt;
}

// 重新生成提示词
function regeneratePrompt() {
    generatePrompt();
    showNotification('已重新生成提示词', 'info');
}

// 优化提示词
function optimizePrompt() {
    const current = document.getElementById('promptOutput').value;
    if (!current.trim()) {
        showNotification('请先生成提示词！', 'warning');
        return;
    }
    
    const optimizations = [
        "\nAdd intricate details and textures",
        "\nEnhance lighting and shadows",
        "\nImprove composition and framing",
        "\nAdd atmospheric effects",
        "\nIncrease contrast and vibrancy",
        "\nAdd depth of field effect",
        "\nEnhance color grading"
    ];
    
    const randomOpt = optimizations[Math.floor(Math.random() * optimizations.length)];
    const optimized = current + randomOpt;
    
    document.getElementById('promptOutput').value = optimized;
    showNotification('提示词已优化！', 'success');
}

// 复制提示词
function copyPrompt() {
    const prompt = document.getElementById('promptOutput').value;
    if (!prompt.trim()) {
        showNotification('没有内容可复制', 'warning');
        return;
    }
    
    navigator.clipboard.writeText(prompt)
        .then(() => showNotification('提示词已复制到剪贴板！', 'success'))
        .catch(err => {
            console.error('复制失败:', err);
            showNotification('复制失败，请手动复制', 'error');
        });
}

// 保存提示词
function savePrompt() {
    const prompt = document.getElementById('promptOutput').value;
    if (!prompt.trim()) {
        showNotification('请先生成提示词！', 'warning');
        return;
    }
    
    // 显示保存模态框
    document.getElementById('saveModal').style.display = 'flex';
    document.getElementById('promptTitle').focus();
}

// 确认保存
function confirmSave() {
    const title = document.getElementById('promptTitle').value.trim() || '未命名提示词';
    const prompt = document.getElementById('promptOutput').value;
    
    // 保存到localStorage
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    history.unshift({
        id: Date.now(),
        title: title,
        prompt: prompt,
        timestamp: new Date().toLocaleString(),
        image: currentImage ? currentImage.src : null
    });
    
    // 只保留最近50条
    if (history.length > 50) history.pop();
    
    localStorage.setItem('promptHistory', JSON.stringify(history));
    
    // 关闭模态框
    closeModal();
    
    // 更新历史列表
    loadHistory();
    
    showNotification('提示词已保存！', 'success');
}

// 关闭模态框
function closeModal() {
    document.getElementById('saveModal').style.display = 'none';
    document.getElementById('promptTitle').value = '';
}

// 加载历史记录
function loadHistory() {
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    const container = document.getElementById('historyList');
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>暂无历史记录</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    history.slice(0, 10).forEach(item => {
        html += `
            <div class="history-item" onclick="loadHistoryItem('${item.id}')">
                <div class="history-title">${item.title}</div>
                <div class="history-date">${item.timestamp}</div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// 加载历史项
function loadHistoryItem(id) {
    const history = JSON.parse(localStorage.getItem('promptHistory') || '[]');
    const item = history.find(h => h.id.toString() === id);
    
    if (item) {
        document.getElementById('promptOutput').value = item.prompt;
        showNotification('已加载历史提示词', 'info');
    }
}

// 清空图片
function clearImage() {
    if (confirm('确定要清除当前图片吗？')) {
        currentImage = null;
        analysisResults = {};
        
        document.getElementById('uploadArea').style.display = 'block';
        document.querySelector('.image-preview-container').style.display = 'none';
        document.getElementById('fileInput').value = '';
        document.getElementById('resultsContainer').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-image"></i>
                <p>上传图片后，点击"AI分析图片"查看结果</p>
            </div>
        `;
        document.getElementById('promptOutput').value = '';
        
        showNotification('已清除图片', 'info');
    }
}

// 更新进度条
function updateProgress(percent, text) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

// 图片转base64
function imageToBase64(img) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        resolve(canvas.toDataURL('image/jpeg', 0.8));
    });
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    
    // 设置类型颜色
    const colors = {
        info: '#3b82f6',
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444'
    };
    
    notification.style.background = colors[type] || colors.info;
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}
