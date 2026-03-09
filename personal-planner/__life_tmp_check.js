
        // ===== ���ݹ��� =====
        let categories = [];
        let sites = [];
        let selectedIcon = '📁';
        let selectedColor = '#a08070';
        let editingCategoryId = null;
        let editingSiteId = null;

        // �� localStorage ��������
        function loadData() {
            const savedCategories = localStorage.getItem('life_categories');
            const savedSites = localStorage.getItem('life_sites');
            
            if (savedCategories) {
                categories = JSON.parse(savedCategories);
            } else {
                // Ĭ�Ϸ���
                categories = [
                    { id: 1, name: '常用工具', icon: '??', color: '#a08070' },
                    { id: 2, name: '学习资源', icon: '??', color: '#9db4a0' },
                    { id: 3, name: '娱乐休闲', icon: '??', color: '#d4a5a5' }
                ];
                saveCategories();
            }
            
            if (savedSites) {
                sites = JSON.parse(savedSites);
            } else {
                // Ĭ����վʾ��
                sites = [
                    { id: 1, name: 'Google', url: 'https://www.google.com', desc: '搜索引擎', categoryId: 1 },
                    { id: 2, name: 'GitHub', url: 'https://github.com', desc: '代码托管平台', categoryId: 1 },
                    { id: 3, name: 'MDN Web Docs', url: 'https://developer.mozilla.org', desc: 'Web 开发文档', categoryId: 2 },
                    { id: 4, name: 'Bilibili', url: 'https://www.bilibili.com', desc: '视频网站', categoryId: 3 }
                ];
                saveSites();
            }
        }

        // ���浽 localStorage
        function saveCategories() {
            localStorage.setItem('life_categories', JSON.stringify(categories));
        }

        function saveSites() {
            localStorage.setItem('life_sites', JSON.stringify(sites));
        }

        // ===== ��Ⱦ���� =====
        function renderCategories() {
            const container = document.getElementById('siteCategories');
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            
            if (categories.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📑</div>
                        <p>还没有分类，点击上方“添加分类”开始吧！</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            
            categories.forEach(category => {
                const categorySites = sites.filter(site => site.categoryId === category.id);
                const filteredSites = searchTerm 
                    ? categorySites.filter(site => 
                        site.name.toLowerCase().includes(searchTerm) || 
                        site.desc.toLowerCase().includes(searchTerm) ||
                        site.url.toLowerCase().includes(searchTerm))
                    : categorySites;
                
                // ����������ʵ�û��ƥ�����������÷���
                if (searchTerm && filteredSites.length === 0) return;
                
                html += `
                    <div class="site-category">
                        <div class="category-header" style="border-left-color: ${category.color}">
                            <div class="category-info">
                                <span class="category-icon">${category.icon}</span>
                                <span class="category-name">${category.name}</span>
                                <span class="category-count">${categorySites.length} 个网站</span>
                            </div>
                            <div class="category-actions">
                                <button class="action-btn" onclick="openSiteModal(${category.id})" title="������վ">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                </button>
                                <button class="action-btn" onclick="openCategoryModal(${category.id})" title="�༭����">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div class="site-grid">
                            ${filteredSites.length === 0 
                                ? '<div class="empty-category">暂无网站，点 + 添加</div>'
                                : filteredSites.map(site => renderSiteCard(site)).join('')
                            }
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html || `
                <div class="empty-state">
                    <div class="empty-icon">🔍</div>
                    <p>没有找到匹配的网站</p>
                </div>
            `;
        }

        function renderSiteCard(site) {
            const faviconUrls = getFaviconUrls(site.url);
            const firstLetter = site.name.charAt(0).toUpperCase();
            return `
                <div class="site-card" onclick="openSite('${site.url}')">
                    <div class="site-favicon" style="background: ${getSiteColor(site.id)}" data-site-id="${site.id}">
                        <img 
                            src="${faviconUrls[0]}" 
                            onerror="tryNextFavicon(this, 0)" 
                            data-favicon-urls='${JSON.stringify(faviconUrls)}'
                            data-first-letter="${firstLetter}"
                            alt="${site.name}"
                        >
                    </div>
                    <div class="site-info">
                        <div class="site-name">${site.name}</div>
                        <div class="site-desc">${site.desc || site.url}</div>
                    </div>
                    <button class="site-edit-btn" onclick="event.stopPropagation(); openSiteModal(null, ${site.id})" title="�༭">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
            `;
        }

        // ��ȡ��� favicon Դ�������ȼ�����
        function getFaviconUrls(url) {
            try {
                const urlObj = new URL(url);
                const hostname = urlObj.hostname;
                const protocol = urlObj.protocol;
                
                return [
                    // 1. ��վ������ favicon.ico
                    `${protocol}//${hostname}/favicon.ico`,
                    // 2. Google favicon ���� (������)
                    `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
                    // 3. DuckDuckGo favicon ����
                    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
                    // 4. Icon Horse ����
                    `https://icon.horse/icon/${hostname}`,
                    // 5. Favicon.io ����
                    `https://favicongrabber.com/api/grab/${hostname}`,
                ];
            } catch {
                return [];
            }
        }

        // ������һ�� favicon Դ
        function tryNextFavicon(img, currentIndex) {
            const urls = JSON.parse(img.dataset.faviconUrls || '[]');
            const nextIndex = currentIndex + 1;
            
            if (nextIndex < urls.length) {
                img.src = urls[nextIndex];
                img.onerror = function() { tryNextFavicon(img, nextIndex); };
            } else {
                // ����Դ��ʧ���ˣ���ʾ����ĸ
                const container = img.parentElement;
                img.style.display = 'none';
                container.innerHTML = `<span class="favicon-letter">${img.dataset.firstLetter}</span>`;
            }
        }

        function getSiteColor(siteId) {
            const colors = ['#f5efe6', '#e8e4df', '#f0e6dc', '#e6f0e8', '#f0e6e6'];
            return colors[siteId % colors.length];
        }

        // ===== �������� =====
        function openModal(modalId) {
            document.getElementById(modalId).classList.add('active');
        }

        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
            // ����״̬
            if (modalId === 'categoryModal') {
                editingCategoryId = null;
                document.getElementById('categoryName').value = '';
                document.getElementById('categoryModalTitle').textContent = '���ӷ���';
                document.getElementById('categoryDeleteBtn').style.display = 'none';
                resetIconSelector();
                resetColorSelector();
            }
            if (modalId === 'siteModal') {
                editingSiteId = null;
                document.getElementById('siteName').value = '';
                document.getElementById('siteUrl').value = '';
                document.getElementById('siteDesc').value = '';
                document.getElementById('siteModalTitle').textContent = '������վ';
                document.getElementById('siteDeleteBtn').style.display = 'none';
            }
        }

        function openCategoryModal(categoryId = null) {
            if (categoryId) {
                // �༭ģʽ
                const category = categories.find(c => c.id === categoryId);
                if (category) {
                    editingCategoryId = categoryId;
                    document.getElementById('categoryName').value = category.name;
                    document.getElementById('categoryModalTitle').textContent = '�༭����';
                    document.getElementById('categoryDeleteBtn').style.display = 'block';
                    
                    // ����ѡ�е�ͼ�����ɫ
                    selectedIcon = category.icon;
                    selectedColor = category.color;
                    updateIconSelector();
                    updateColorSelector();
                }
            } else {
                // ����ģʽ
                editingCategoryId = null;
                document.getElementById('categoryName').value = '';
                document.getElementById('categoryModalTitle').textContent = '���ӷ���';
                document.getElementById('categoryDeleteBtn').style.display = 'none';
                selectedIcon = '📁';
                selectedColor = '#a08070';
                updateIconSelector();
                updateColorSelector();
            }
            openModal('categoryModal');
        }

        function openSiteModal(defaultCategoryId = null, siteId = null) {
            // ���·�������ѡ��
            const select = document.getElementById('siteCategory');
            select.innerHTML = categories.map(c => 
                `<option value="${c.id}">${c.icon} ${c.name}</option>`
            ).join('');
            
            if (siteId) {
                // �༭ģʽ
                const site = sites.find(s => s.id === siteId);
                if (site) {
                    editingSiteId = siteId;
                    document.getElementById('siteName').value = site.name;
                    document.getElementById('siteUrl').value = site.url;
                    document.getElementById('siteDesc').value = site.desc || '';
                    document.getElementById('siteCategory').value = site.categoryId;
                    document.getElementById('siteModalTitle').textContent = '�༭��վ';
                    document.getElementById('siteDeleteBtn').style.display = 'block';
                }
            } else {
                // ����ģʽ
                editingSiteId = null;
                document.getElementById('siteName').value = '';
                document.getElementById('siteUrl').value = '';
                document.getElementById('siteDesc').value = '';
                if (defaultCategoryId) {
                    document.getElementById('siteCategory').value = defaultCategoryId;
                }
                document.getElementById('siteModalTitle').textContent = '������վ';
                document.getElementById('siteDeleteBtn').style.display = 'none';
            }
            openModal('siteModal');
        }

        // ===== ͼ�����ɫѡ�� =====
        function selectIcon(btn) {
            document.querySelectorAll('#iconSelector .icon-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedIcon = btn.dataset.icon;
        }

        function selectColor(btn) {
            document.querySelectorAll('#colorSelector .color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedColor = btn.dataset.color;
        }

        function updateIconSelector() {
            document.querySelectorAll('#iconSelector .icon-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.icon === selectedIcon);
            });
        }

        function updateColorSelector() {
            document.querySelectorAll('#colorSelector .color-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.color === selectedColor);
            });
        }

        function resetIconSelector() {
            selectedIcon = '📁';
            updateIconSelector();
        }

        function resetColorSelector() {
            selectedColor = '#a08070';
            updateColorSelector();
        }

        // ===== ������� =====
        function saveCategory() {
            const name = document.getElementById('categoryName').value.trim();
            if (!name) {
                alert('请输入分类名称');
                return;
            }
            
            if (editingCategoryId) {
                // ���·���
                const index = categories.findIndex(c => c.id === editingCategoryId);
                if (index !== -1) {
                    categories[index] = {
                        ...categories[index],
                        name,
                        icon: selectedIcon,
                        color: selectedColor
                    };
                }
            } else {
                // �����·���
                const newId = categories.length > 0 ? Math.max(...categories.map(c => c.id)) + 1 : 1;
                categories.push({
                    id: newId,
                    name,
                    icon: selectedIcon,
                    color: selectedColor
                });
            }
            
            saveCategories();
            renderCategories();
            closeModal('categoryModal');
        }

        function deleteCategory() {
            if (!editingCategoryId) return;
            
            if (!confirm('确定删除该分类？分类下的所有网站也会被删除。')) return;
            
            // ɾ������
            categories = categories.filter(c => c.id !== editingCategoryId);
            // ɾ���÷����µ�������վ
            sites = sites.filter(s => s.categoryId !== editingCategoryId);
            
            saveCategories();
            saveSites();
            renderCategories();
            closeModal('categoryModal');
        }

        function saveSite() {
            const name = document.getElementById('siteName').value.trim();
            const url = document.getElementById('siteUrl').value.trim();
            const desc = document.getElementById('siteDesc').value.trim();
            const categoryId = parseInt(document.getElementById('siteCategory').value);
            
            if (!name) {
                alert('请输入网站名称');
                return;
            }
            if (!url) {
                alert('请输入网站地址');
                return;
            }
            
            // ��ʽ�� URL
            let formattedUrl = url;
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                formattedUrl = 'https://' + url;
            }
            
            if (editingSiteId) {
                // ������վ
                const index = sites.findIndex(s => s.id === editingSiteId);
                if (index !== -1) {
                    sites[index] = {
                        ...sites[index],
                        name,
                        url: formattedUrl,
                        desc,
                        categoryId
                    };
                }
            } else {
                // ��������վ
                const newId = sites.length > 0 ? Math.max(...sites.map(s => s.id)) + 1 : 1;
                sites.push({
                    id: newId,
                    name,
                    url: formattedUrl,
                    desc,
                    categoryId
                });
            }
            
            saveSites();
            renderCategories();
            closeModal('siteModal');
        }

        function deleteSite() {
            if (!editingSiteId) return;
            
            if (!confirm('确定删除该网站？')) return;
            
            sites = sites.filter(s => s.id !== editingSiteId);
            saveSites();
            renderCategories();
            closeModal('siteModal');
        }

        // ===== �������� =====
        function openSite(url) {
            window.open(url, '_blank');
        }

        function filterSites() {
            renderCategories();
        }

        // ===== ������۵� =====
        function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        }

        // ===== ��ʼ�� =====
        document.addEventListener('DOMContentLoaded', () => {
            // �ָ������״̬
            const sidebar = document.getElementById('sidebar');
            const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
            if (isCollapsed) {
                sidebar.classList.add('collapsed');
            }
            
            // ���õ�ǰ����
            const dateEl = document.getElementById('currentDate');
            if (dateEl) {
                const now = new Date();
                const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
                dateEl.textContent = now.toLocaleDateString('zh-CN', options);
            }
            
            // �������ݲ���Ⱦ
            loadData();
            renderCategories();
        });

        // ��������ⲿ�ر�
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    const shouldClose = confirm('检测到点击空白区域。确认退出编辑吗？未保存内容将丢失。');
                    if (shouldClose) {
                        closeModal(overlay.id);
                    }
                }
            });
        });
    