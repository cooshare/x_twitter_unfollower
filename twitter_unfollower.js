/**
 * Twitter/X 批量取关脚本 - 浏览器 Console 版本 (修复版)
 * 使用方法：
 * 1. 打开 https://x.com/following
 * 2. 按 F12 打开开发者工具
 * 3. 切换到 Console 标签
 * 4. 复制粘贴此脚本并回车执行
 */

(function() {
    'use strict';

    // ==================== 配置区域 ====================
    const CONFIG = {
        // 白名单 - 这些账号不会被取关（不需要 @ 符号）
        whitelist: [
            '1',
            '2'
        ],

        // 每次运行最大取关数量（安全限制）
        maxUnfollows: 50,

        // 操作间隔时间（毫秒）
        delayBetweenActions: 2000,

        // 是否开启模拟模式（true = 只显示不执行）
        dryRun: false,

        // 是否自动滚动加载更多
        autoScroll: true,

        // 滚动次数
        scrollCount: 3
    };

    // ==================== 状态跟踪 ====================
    const state = {
        processed: 0,
        unfollowed: 0,
        skipped: 0,
        errors: 0,
        startTime: Date.now(),
        // 已处理的用户名集合（用于刷新列表后定位继续位置）
        processedUsers: new Set()
    };

    // ==================== 工具函数 ====================

    // 延迟函数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 日志输出
    const log = {
        info: (msg) => console.log(`%c[INFO] ${msg}`, 'color: #1da1f2'),
        success: (msg) => console.log(`%c[SUCCESS] ${msg}`, 'color: #00ff00'),
        warning: (msg) => console.log(`%c[WARNING] ${msg}`, 'color: #ffaa00'),
        error: (msg) => console.log(`%c[ERROR] ${msg}`, 'color: #ff0000'),
        debug: (msg) => console.log(`%c[DEBUG] ${msg}`, 'color: #888888'),
        stats: () => {
            const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
            console.log('\n' + '='.repeat(50));
            console.log('%c执行统计:', 'font-weight: bold');
            console.log(`  已处理: ${state.processed} (累计记录: ${state.processedUsers.size})`);
            console.log(`  已取关: ${state.unfollowed}`);
            console.log(`  已跳过(白名单): ${state.skipped}`);
            console.log(`  错误: ${state.errors}`);
            console.log(`  耗时: ${elapsed}秒`);
            console.log('='.repeat(50));
        }
    };

    // 检查是否在白名单中
    const isWhitelisted = (username) => {
        if (!username) return false;
        const lowerUsername = username.toLowerCase();
        return CONFIG.whitelist.some(name => 
            name.toLowerCase() === lowerUsername
        );
    };

    // 滚动页面加载更多
    const scrollToLoadMore = async () => {
        if (!CONFIG.autoScroll) return;
        
        log.info(`开始滚动加载更多内容 (${CONFIG.scrollCount} 次)...`);
        
        for (let i = 0; i < CONFIG.scrollCount; i++) {
            window.scrollBy(0, 800);
            await sleep(1500);
            log.info(`滚动 ${i + 1}/${CONFIG.scrollCount}`);
        }
        
        // 滚动回顶部
        window.scrollTo(0, 0);
        await sleep(1000);
    };

    // 获取所有关注中的用户 - 修复版
    const getFollowingUsers = () => {
        const users = [];
        
        // 方法1: 使用 aria-label 查找"正在关注"按钮
        // 从页面快照可以看到按钮格式: "正在关注 @username"
        const followingButtons = document.querySelectorAll('button[aria-label*="正在关注"]');
        log.debug(`找到 ${followingButtons.length} 个"正在关注"按钮`);
        
        followingButtons.forEach((btn, index) => {
            try {
                const ariaLabel = btn.getAttribute('aria-label') || '';
                log.debug(`按钮 aria-label: ${ariaLabel}`);
                
                // 从 aria-label 提取用户名
                // 格式: "正在关注 @username" 或 "Following @username"
                const match = ariaLabel.match(/@(\w+)/);
                if (match) {
                    const username = match[1];
                    
                    // 找到包含此按钮的单元格
                    const cell = btn.closest('[data-testid="UserCell"]') || 
                                 btn.closest('div[data-testid="UserCell"]') ||
                                 btn.parentElement?.parentElement?.parentElement;
                    
                    // 获取显示名称
                    let displayName = username;
                    if (cell) {
                        const displayNameEl = cell.querySelector('[data-testid="UserName"]');
                        if (displayNameEl) {
                            displayName = displayNameEl.innerText.split('\n')[0] || username;
                        }
                    }
                    
                    users.push({
                        index,
                        username,
                        displayName,
                        element: cell,
                        unfollowBtn: btn
                    });
                    
                    log.debug(`找到用户: @${username} (${displayName})`);
                }
            } catch (e) {
                log.error(`解析按钮时出错: ${e.message}`);
            }
        });

        // 方法2: 如果方法1没找到，尝试使用 UserCell
        if (users.length === 0) {
            log.debug('aria-label 方法未找到用户，尝试 UserCell 方法...');
            
            const userCells = document.querySelectorAll('[data-testid="UserCell"]');
            log.debug(`找到 ${userCells.length} 个 UserCell`);
            
            userCells.forEach((cell, index) => {
                try {
                    // 获取用户名链接
                    const usernameLink = cell.querySelector('a[href^="/"]');
                    if (!usernameLink) return;

                    const href = usernameLink.getAttribute('href');
                    const username = href ? href.replace('/', '').split('?')[0] : '';
                    
                    // 获取显示名称
                    const displayNameEl = cell.querySelector('[data-testid="UserName"]');
                    const displayName = displayNameEl ? 
                        displayNameEl.innerText.split('\n')[0] : username;

                    // 查找"正在关注"按钮
                    const unfollowBtn = cell.querySelector('button[aria-label*="正在关注"]') ||
                                       cell.querySelector('[data-testid="unfollow"]');
                    
                    if (username && unfollowBtn) {
                        users.push({
                            index,
                            username,
                            displayName,
                            element: cell,
                            unfollowBtn: unfollowBtn
                        });
                        log.debug(`UserCell 方法找到用户: @${username}`);
                    }
                } catch (e) {
                    log.error(`UserCell 解析出错: ${e.message}`);
                }
            });
        }

        return users;
    };

    // 执行取关操作 - 修复版
    const unfollowUser = async (user) => {
        try {
            if (CONFIG.dryRun) {
                log.warning(`[模拟] 将取关: @${user.username} (${user.displayName})`);
                return true;
            }

            log.info(`正在取关: @${user.username} (${user.displayName})`);

            // 点击"正在关注"按钮
            if (!user.unfollowBtn) {
                throw new Error('未找到取关按钮');
            }

            log.debug('点击关注按钮...');
            user.unfollowBtn.click();
            await sleep(1000);

            // 查找确认按钮 - 多种选择器
            let confirmBtn = null;
            
            // 选择器1: data-testid="confirmationSheetConfirm"
            confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
            
            // 选择器2: 查找包含"取消关注"或"Unfollow"文本的按钮
            if (!confirmBtn) {
                const buttons = document.querySelectorAll('button, div[role="button"]');
                for (const btn of buttons) {
                    const text = btn.innerText || btn.textContent || '';
                    if (text.includes('取消关注') || text === 'Unfollow') {
                        confirmBtn = btn;
                        log.debug(`找到确认按钮，文本: "${text}"`);
                        break;
                    }
                }
            }
            
            // 选择器3: 查找弹出菜单中的取消关注选项
            if (!confirmBtn) {
                const menuItems = document.querySelectorAll('[role="menuitem"]');
                for (const item of menuItems) {
                    const text = item.innerText || item.textContent || '';
                    if (text.includes('取消关注') || text.includes('Unfollow')) {
                        confirmBtn = item;
                        log.debug('找到菜单项确认按钮');
                        break;
                    }
                }
            }

            if (confirmBtn) {
                log.debug('点击确认按钮...');
                confirmBtn.click();
                await sleep(CONFIG.delayBetweenActions);
                log.success(`✓ 已取关 @${user.username}`);
                return true;
            } else {
                log.warning('未找到确认按钮，可能已自动取关或需要手动确认');
                await sleep(CONFIG.delayBetweenActions);
                return false;
            }

        } catch (error) {
            log.error(`取关 @${user.username} 失败: ${error.message}`);
            return false;
        }
    };

    // 主执行函数
    const run = async () => {
        console.clear();
        console.log('%cTwitter/X 批量取关脚本 (修复版)', 'font-size: 20px; font-weight: bold; color: #1da1f2');
        console.log('='.repeat(50));

        // 检查页面
        if (!window.location.href.includes('/following')) {
            log.error('请在 Twitter/X 的关注页面运行此脚本');
            log.info('请访问: https://x.com/following');
            return;
        }

        // 显示配置
        log.info('配置信息:');
        log.info(`  白名单: ${CONFIG.whitelist.length > 0 ? CONFIG.whitelist.join(', ') : '(空)'}`);
        log.info(`  最大取关数: ${CONFIG.maxUnfollows}`);
        log.info(`  操作间隔: ${CONFIG.delayBetweenActions}ms`);
        log.info(`  模拟模式: ${CONFIG.dryRun ? '开启' : '关闭'}`);
        console.log('');

        // 确认执行
        if (!CONFIG.dryRun) {
            const confirmMsg = `确定要开始取关吗？\n白名单保护: ${CONFIG.whitelist.length} 个账号\n最大取关: ${CONFIG.maxUnfollows} 个`;
            if (!confirm(confirmMsg)) {
                log.info('用户取消操作');
                return;
            }
        }

        // 滚动加载
        await scrollToLoadMore();

        // 获取用户列表
        log.info('正在获取关注列表...');
        let users = getFollowingUsers();
        log.info(`找到 ${users.length} 个关注中的账号`);

        if (users.length === 0) {
            log.warning('未找到任何关注账号，请确保页面已加载完成');
            log.info('提示：尝试手动滚动页面后再运行脚本');
            return;
        }

        // 显示找到的用户列表（调试）
        console.log('');
        log.info('用户列表预览:');
        users.slice(0, 5).forEach((user, i) => {
            const whitelistMark = isWhitelisted(user.username) ? ' [白名单]' : '';
            log.info(`  ${i + 1}. @${user.username} (${user.displayName})${whitelistMark}`);
        });
        if (users.length > 5) {
            log.info(`  ... 还有 ${users.length - 5} 个账号`);
        }
        console.log('');

        log.info('开始处理...');
        console.log('');

        // 处理每个用户
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            
            // 检查是否已处理过（刷新列表后可能遇到已处理的用户）
            if (state.processedUsers.has(user.username.toLowerCase())) {
                log.debug(`跳过已处理的用户: @${user.username}`);
                continue;
            }
            
            state.processed++;
            state.processedUsers.add(user.username.toLowerCase());

            // 检查是否达到最大数量
            if (state.unfollowed >= CONFIG.maxUnfollows) {
                log.warning(`已达到最大取关数量限制 (${CONFIG.maxUnfollows})`);
                break;
            }

            // 检查白名单
            if (isWhitelisted(user.username)) {
                log.info(`⊘ 跳过白名单账号: @${user.username} (${user.displayName})`);
                state.skipped++;
                continue;
            }

            // 执行取关
            const success = await unfollowUser(user);
            if (success) {
                state.unfollowed++;
            } else {
                state.errors++;
            }

            // 每处理5个刷新一次列表（避免DOM过期）
            if (state.processed % 5 === 0 && !CONFIG.dryRun) {
                log.info('刷新用户列表...');
                await sleep(2000);
                users = getFollowingUsers();
                log.info(`刷新后找到 ${users.length} 个用户`);
                
                // 找到新列表中第一个未处理用户的索引
                let newStartIndex = -1;
                for (let j = 0; j < users.length; j++) {
                    if (!state.processedUsers.has(users[j].username.toLowerCase())) {
                        newStartIndex = j;
                        log.debug(`找到未处理用户位置: 索引 ${j}, 用户 @${users[j].username}`);
                        break;
                    }
                }
                
                if (newStartIndex === -1) {
                    // 所有用户都已处理完毕
                    log.info('所有用户都已处理完毕');
                    break;
                }
                
                // 设置循环索引为找到的位置-1（因为循环末尾会i++）
                i = newStartIndex - 1;
                log.info(`继续从索引 ${newStartIndex} 处理，用户 @${users[newStartIndex].username}`);
            }
        }

        // 显示统计
        log.stats();

        if (CONFIG.dryRun) {
            console.log('\n%c提示: 当前为模拟模式，没有实际执行取关操作', 'color: #ffaa00');
            console.log('如需实际执行，请将 CONFIG.dryRun 设置为 false');
        }
    };

    // 启动
    run().catch(error => {
        log.error(`脚本执行出错: ${error.message}`);
        console.error(error);
    });

})();