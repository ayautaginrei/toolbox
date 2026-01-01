// ==UserScript==
// @name         メトロポリス・コーリング　ログ保存ツール
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  チャットルームのログを複数ページ分取得し、保存しやすくするツール
// @author       ayautaginrei
// @match        https://metropolis-c-openbeta.sakuraweb.com/room.php*
// @updateURL    https://github.com/ayautaginrei/toolbox/raw/refs/heads/main/teiki_scripts/%E3%83%A1%E3%83%88%E3%83%AD%E3%83%9D%E3%83%AA%E3%82%B9%E3%83%BB%E3%82%B3%E3%83%BC%E3%83%AA%E3%83%B3%E3%82%B0%E3%80%80%E3%83%AD%E3%82%B0%E4%BF%9D%E5%AD%98%E3%83%84%E3%83%BC%E3%83%AB.user.js
// @grant        none
// ==/UserScript==

//  メトロポリス・コーリングにおけるルーム内のログ保存を支援するスクリプトです。
//
//  使い方
//  - ログを保存したいルームに入る
//  - メニュー欄に追加された「ログ取得ツール」からモーダルを開き、取得したいページ範囲を入力して「ログ取得・表示開始」を押す（件数が多い場合には時間がかかることがあります）
//  - 表示が切り替わった後、画面下部の操作パネルからログ整形・取得が可能
//
//  ※当スクリプトの使用については自己責任でお願いします。
//  ※致命的な不具合等ありましたらayautaginreiまでご連絡ください。

(function() {
    'use strict';

    // 設定
    const FETCH_INTERVAL = 2000; // 1ページ取得ごとの待機時間(ms)
    const BACKGROUND_IMAGE_URL = 'https://metropolis-c-openbeta.sakuraweb.com/images/back.png';

    // 状態管理用変数
    let currentSortOrder = 'asc';
    let currentColumnCount = 2;
    let roomName = '';

    // UI初期化
    function init() {
        if (document.getElementById('ls-open-btn')) return;

        const linkContainer = document.querySelector('.links');
        if (!linkContainer) return;

        const separator = document.createTextNode(' | ');
        const openBtn = document.createElement('a');
        openBtn.id = 'ls-open-btn';
        openBtn.href = '#';
        openBtn.innerText = 'ログ取得ツール';
        openBtn.style.color = '#ff99cc';
        openBtn.style.fontWeight = 'bold';
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleModal();
        });

        const pTag = linkContainer.querySelector('p');
        if (pTag) {
            pTag.appendChild(separator);
            pTag.appendChild(openBtn);
        }

        createModalElement();
    }

    // 設定モーダルの作成
    function createModalElement() {
        if (document.getElementById('log-saver-modal')) return;

        // ルーム名取得
        const h1 = document.querySelector('h1');
        if (h1) {
            const match = h1.textContent.match(/ルーム\s*:\s*(.+)/);
            if (match) roomName = match[1].trim();
        }

        const modal = document.createElement('div');
        modal.id = 'log-saver-modal';
        modal.innerHTML = `
            <div class="ls-content">
                <h2>ログ取得設定</h2>
                <div class="ls-description">
                    現在の画面を上書きして、指定した範囲のログをまとめて表示します。<br>
                    取得後はチェックボックスで不要なログを選択し、一括非表示にできます。
                </div>
                <div class="ls-settings">
                    <label>開始ページ: <input type="number" id="ls-start-page" value="1" min="1"></label>
                    <label>終了ページ: <input type="number" id="ls-end-page" value="5" min="1" placeholder="空欄で自動"></label>
                    <br>
                    <label><input type="checkbox" id="ls-exclude-deleted" checked> 削除済みの投稿を除外</label>
                </div>
                <div class="ls-actions">
                    <button id="ls-run-btn">ログ取得・表示開始</button>
                    <button id="ls-close-btn">閉じる</button>
                </div>
                <div id="ls-status"></div>
            </div>
        `;

        // CSS定義
        const style = document.createElement('style');
        style.textContent = `
            body.ls-active {
                background-attachment: fixed !important;
                background-size: cover !important;
            }
            #log-saver-modal {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(4px);
                z-index: 9999; display: none; justify-content: center; align-items: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .ls-content {
                background: linear-gradient(135deg, #2c2c2c 0%, #1a1a1a 100%);
                padding: 32px; border-radius: 16px; width: 90%; max-width: 520px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .ls-content h2 { margin: 0 0 20px 0; font-size: 1.5rem; font-weight: 600; color: #fff; }
            .ls-description {
                color: #aaa; font-size: 0.9rem; line-height: 1.6; margin-bottom: 24px;
                padding: 12px; background: rgba(255, 255, 255, 0.05);
                border-radius: 8px; border-left: 3px solid #007bff;
            }
            .ls-settings { margin-bottom: 24px; }
            .ls-settings label { display: block; margin-bottom: 12px; color: #ddd; font-size: 0.95rem; font-weight: 500; }
            .ls-settings input[type="number"], .ls-settings select {
                width: 100%; max-width: 200px; padding: 8px 12px; border-radius: 8px;
                border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1);
                color: #fff; font-size: 0.95rem; margin-top: 6px; transition: all 0.2s;
            }
            .ls-settings input[type="number"]:focus, .ls-settings select:focus {
                outline: none; border-color: #007bff; background: rgba(255, 255, 255, 0.15);
            }
            .ls-settings input[type="checkbox"] { margin-right: 8px; transform: scale(1.1); cursor: pointer; }
            .ls-actions { display: flex; gap: 12px; flex-wrap: wrap; }
            .ls-actions button {
                padding: 12px 24px; cursor: pointer; border: none; border-radius: 8px;
                font-weight: 600; font-size: 0.95rem; flex: 1; min-width: 120px;
            }
            #ls-run-btn { background: #007bff; color: white; }
            #ls-close-btn { background: rgba(255, 255, 255, 0.1); color: #ddd; border: 1px solid rgba(255, 255, 255, 0.2); }
            #ls-status {
                margin-top: 16px; color: #87cefa; font-weight: 500; font-size: 0.9rem;
                padding: 8px; background: rgba(135, 206, 250, 0.1); border-radius: 6px; text-align: center;
            }
            .ls-container {
                display: flex; justify-content: space-between; gap: 20px;
                max-width: 1040px; margin: 20px auto 100px auto; padding: 20px 35px;
                background-color: rgba(0, 0, 0, 0.7); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
            }
            .ls-container.single-column { flex-direction: column; align-items: center; max-width: 540px; }
            .ls-container.single-column .ls-column { width: 100%; max-width: 490px; }
            .ls-column { flex: 1; min-width: 0; max-width: 490px; }
            .ls-post-wrapper { width: 100%; margin-bottom: 1em; position: relative; transition: all 0.3s ease; }
            .ls-post-wrapper .post { max-width: 100%; box-sizing: border-box; }
            .ls-checkbox {
                position: absolute; top: 10px; left: -30px; transform: scale(1.3);
                cursor: pointer; z-index: 10; accent-color: #007bff;
            }
            .ls-post-wrapper.ls-hidden { display: none !important; }
            #ls-control-bar {
                position: fixed; bottom: 0; left: 0; width: 100%;
                background: linear-gradient(to top, rgba(0, 0, 0, 0.98) 0%, rgba(0, 0, 0, 0.95) 100%);
                backdrop-filter: blur(8px); padding: 16px 24px;
                display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
                gap: 10px; z-index: 1000; border-top: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
            }
            #ls-control-bar button {
                padding: 8px 16px; cursor: pointer; border-radius: 6px; border: none;
                font-weight: 500; font-size: 0.85rem; white-space: nowrap;
            }
            #ls-hide-checked-btn, #ls-restore-all-btn, #ls-toggle-sort-btn,
            #ls-toggle-column-btn, #ls-select-all-btn {
                background: rgba(255, 255, 255, 0.15); color: #fff; border: 1px solid rgba(255, 255, 255, 0.2);
            }
            #ls-download-html-btn { background: #17a2b8; color: white; }
            #ls-reload-btn { background: #dc3545; color: white; }
            .ls-info {
                color: #fff; margin-right: 12px; font-size: 0.9rem; font-weight: 600;
                padding: 8px 16px; background: rgba(255, 255, 255, 0.1);
                border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.2);
            }
            @media (max-width: 768px) {
                .ls-container { flex-direction: column; gap: 0; padding: 15px 25px; margin: 10px auto 100px auto; max-width: 540px; }
                .ls-column { width: 100%; max-width: 490px; }
                .ls-checkbox { left: -24px; transform: scale(1.2); }
                #ls-control-bar { padding: 12px 16px; gap: 8px; }
                #ls-control-bar button { padding: 6px 12px; font-size: 0.8rem; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(modal);

        document.getElementById('ls-close-btn').addEventListener('click', toggleModal);
        document.getElementById('ls-run-btn').addEventListener('click', startFetching);
        modal.addEventListener('click', (e) => { if (e.target === modal) toggleModal(); });
    }

    function toggleModal() {
        const modal = document.getElementById('log-saver-modal');
        modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
    }

    // ログ取得メイン処理
    async function startFetching() {
        const startPage = parseInt(document.getElementById('ls-start-page').value) || 1;
        let endPage = document.getElementById('ls-end-page').value;
        const excludeDeleted = document.getElementById('ls-exclude-deleted').checked;
        const statusDiv = document.getElementById('ls-status');

        // 初期化
        currentSortOrder = 'asc';
        currentColumnCount = 2;
        const isAutoEnd = !endPage;
        endPage = isAutoEnd ? 100 : parseInt(endPage);
        let allPosts = [];

        statusDiv.textContent = '初期化中...';
        const currentParams = new URLSearchParams(window.location.search);
        const baseUrl = window.location.pathname;

        for (let i = startPage; i <= endPage; i++) {
            statusDiv.textContent = `ページ ${i} を取得中... (現在 ${allPosts.length} 件)`;
            currentParams.set('page', i);
            const targetUrl = `${baseUrl}?${currentParams.toString()}`;

            try {
                const response = await fetch(targetUrl);
                const text = await response.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                const posts = Array.from(doc.querySelectorAll('.container .column .post'));

                if (posts.length === 0) {
                    statusDiv.textContent = `ページ ${i} に投稿がありません。取得を終了します。`;
                    break;
                }

                posts.forEach(post => {
                    // 削除済み除外判定
                    if (excludeDeleted && (post.innerText.includes('削除済み投稿') || post.innerText.includes('削除されました'))) {
                        return;
                    }

                    const clone = post.cloneNode(true);
                    clone.querySelectorAll('.post-actions, button, form, .reply-button').forEach(el => el.remove());

                    const idNum = parseInt(post.id.replace('post-', '')) || 0;
                    const nameEl = clone.querySelector('strong a');
                    const posterName = nameEl ? nameEl.innerText : 'Unknown';

                    allPosts.push({ element: clone, id: idNum, name: posterName });
                });
            } catch (err) {
                console.error(err);
                statusDiv.textContent = `エラー: ページ ${i} の取得失敗`;
                break;
            }

            await new Promise(r => setTimeout(r, FETCH_INTERVAL));
        }

        statusDiv.textContent = `全 ${allPosts.length} 件取得完了。画面を生成します...`;

        // ソート処理
        allPosts.sort((a, b) => currentSortOrder === 'asc' ? a.id - b.id : b.id - a.id);
        renderResult(allPosts);
    }

    // 結果描画
    function renderResult(postsData) {
        document.getElementById('log-saver-modal').style.display = 'none';
        document.body.classList.add('ls-active');

        // 既存要素の非表示
        const container = document.querySelector('.container');
        const formArea = document.querySelector('.post-form-area');
        const pagination = document.querySelector('.pagination');
        const tabs = document.querySelector('.tabs');
        if (formArea) formArea.style.display = 'none';
        if (pagination) pagination.style.display = 'none';
        if (tabs) tabs.style.display = 'none';

        if (!container) { alert('エラー: 描画エリアが見つかりません'); return; }

        container.innerHTML = '';
        container.style.display = 'flex';
        container.classList.add('ls-container');
        if (currentColumnCount === 1) container.classList.add('single-column');

        // カラム作成
        const column1 = document.createElement('div');
        column1.className = 'ls-column';
        column1.id = 'ls-column-1';
        const column2 = document.createElement('div');
        column2.className = 'ls-column';
        column2.id = 'ls-column-2';
        if (currentColumnCount === 1) column2.style.display = 'none';

        container.appendChild(column1);
        container.appendChild(column2);

        // 投稿の配置
        const halfPoint = Math.ceil(postsData.length / 2);
        postsData.forEach((item, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'ls-post-wrapper';
            wrapper.dataset.id = item.id;
            wrapper.dataset.originalIndex = index;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'ls-checkbox';
            wrapper.appendChild(checkbox);
            wrapper.appendChild(item.element);

            if (currentColumnCount === 2) {
                (index < halfPoint ? column1 : column2).appendChild(wrapper);
            } else {
                column1.appendChild(wrapper);
            }
        });

        createControlBar(postsData.length);
        window.scrollTo(0, 0);
    }

    // コントロールバー作成
    function createControlBar(count) {
        let controlBar = document.getElementById('ls-control-bar');
        if (controlBar) controlBar.remove();

        controlBar = document.createElement('div');
        controlBar.id = 'ls-control-bar';
        controlBar.innerHTML = `
            <span class="ls-info" id="ls-count-info">${count}件</span>
            <button id="ls-select-all-btn">全選択/解除</button>
            <button id="ls-hide-checked-btn">選択ログを非表示</button>
            <button id="ls-restore-all-btn">非表示ログを再表示</button>
            <button id="ls-toggle-column-btn">カラム数: 2カラム</button>
            <button id="ls-toggle-sort-btn">並び順: ${currentSortOrder === 'asc' ? '古い順' : '新しい順'}</button>
            <button id="ls-download-html-btn">保存</button>
            <button id="ls-reload-btn">ログ保存画面を終了</button>
        `;
        document.body.appendChild(controlBar);

        // イベント設定
        document.getElementById('ls-reload-btn').addEventListener('click', () => location.reload());

        document.getElementById('ls-hide-checked-btn').addEventListener('click', () => {
            document.querySelectorAll('.ls-post-wrapper').forEach(wrap => {
                const chk = wrap.querySelector('.ls-checkbox');
                if (chk && chk.checked) {
                    wrap.classList.add('ls-hidden');
                    chk.checked = false;
                }
            });
        });

        document.getElementById('ls-restore-all-btn').addEventListener('click', () => {
            document.querySelectorAll('.ls-post-wrapper.ls-hidden').forEach(wrap => wrap.classList.remove('ls-hidden'));
        });

        document.getElementById('ls-select-all-btn').addEventListener('click', () => {
            const wrappers = document.querySelectorAll('.ls-post-wrapper:not(.ls-hidden)');
            if (wrappers.length === 0) return;
            const checkboxes = Array.from(wrappers).map(w => w.querySelector('.ls-checkbox'));
            const allChecked = checkboxes.every(c => c.checked);
            checkboxes.forEach(c => c.checked = !allChecked);
        });

        document.getElementById('ls-toggle-sort-btn').addEventListener('click', () => {
            toggleLayout(true);
        });

        document.getElementById('ls-toggle-column-btn').addEventListener('click', () => {
            toggleLayout(false);
        });

        document.getElementById('ls-download-html-btn').addEventListener('click', downloadHtml);
    }

    // レイアウト・ソート変更処理（共通化）
    function toggleLayout(isSortChange) {
        const container = document.querySelector('.ls-container');
        const column1 = document.getElementById('ls-column-1');
        const column2 = document.getElementById('ls-column-2');
        const allWrappers = [...Array.from(column1.children), ...Array.from(column2.children)];

        if (isSortChange) {
            currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
            document.getElementById('ls-toggle-sort-btn').innerText = `並び順: ${currentSortOrder === 'asc' ? '古い順' : '新しい順'}`;
        } else {
            currentColumnCount = currentColumnCount === 2 ? 1 : 2;
            document.getElementById('ls-toggle-column-btn').innerText = `カラム数: ${currentColumnCount}カラム`;
            if (currentColumnCount === 1) {
                container.classList.add('single-column');
                column2.style.display = 'none';
            } else {
                container.classList.remove('single-column');
                column2.style.display = 'block';
            }
        }

        // 再配置
        allWrappers.sort((a, b) => {
            const idxA = parseInt(a.dataset.originalIndex);
            const idxB = parseInt(b.dataset.originalIndex);
            return currentSortOrder === 'asc' ? idxA - idxB : idxB - idxA; // originalIndex基準でソート
        });

        column1.innerHTML = '';
        column2.innerHTML = '';

        if (currentColumnCount === 2) {
            const halfPoint = Math.ceil(allWrappers.length / 2);
            allWrappers.forEach((w, index) => (index < halfPoint ? column1 : column2).appendChild(w));
        } else {
            allWrappers.forEach(w => column1.appendChild(w));
        }
    }

    // HTML保存機能
    function downloadHtml() {
        const h1 = document.querySelector('h1');
        const ownerInfo = document.querySelector('p[style*="text-align:center"]');
        const container = document.querySelector('.ls-container');
        if (!container) { alert('エラー: ログコンテナが見つかりません'); return; }

        const containerClone = container.cloneNode(true);
        containerClone.querySelectorAll('.ls-checkbox').forEach(cb => cb.remove());

        const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${roomName || 'ログ保存'}</title>
    <style>
        body {
            background-image: url('${BACKGROUND_IMAGE_URL}');
            background-size: cover; background-repeat: no-repeat; background-position: center; background-attachment: fixed;
            color: #ffffff; font-family: Arial, sans-serif; margin: 0; padding: 20px;
        }
        h1 { color: #ffffff; text-align: center; margin-bottom: 5px; }
        .owner-info { text-align: center; color: #ccc; margin-bottom: 20px; }
        .ls-container {
            display: flex; justify-content: space-between; gap: 20px;
            max-width: 1040px; margin: 20px auto; padding: 20px 35px;
            background-color: rgba(0, 0, 0, 0.7); border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }
        .ls-container.single-column { flex-direction: column; align-items: center; max-width: 540px; }
        .ls-container.single-column .ls-column { width: 100%; max-width: 490px; }
        .ls-column { flex: 1; min-width: 0; max-width: 490px; }
        .ls-post-wrapper { width: 100%; margin-bottom: 1em; }
        .ls-post-wrapper.ls-hidden { display: none; }
        .post {
            display: flex; gap: 10px; margin-bottom: 1em; padding: 10px;
            background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px; color: #e0f7ff; word-wrap: break-word; max-width: 100%; box-sizing: border-box;
        }
        .post img.icon { width: 60px; height: 60px; object-fit: cover; flex-shrink: 0; }
        .post-content-area { flex-grow: 1; }
        .post strong { color: #FFD700; font-size: 1.1em; margin-right: 10px; }
        .post strong a { color: #FFD700; text-decoration: none; }
        .post em { color: #cccccc; font-size: 0.85em; font-style: normal; white-space: nowrap; }
        .reply-to { font-size: 0.9em; color: #87cefa; margin-top: 0; margin-bottom: 5px; }
        @media (max-width: 768px) {
            .ls-container { flex-direction: column; gap: 0; padding: 15px 25px; max-width: 540px; }
            .ls-column { width: 100%; max-width: 490px; }
        }
    </style>
</head>
<body>
    ${h1 ? h1.outerHTML : '<h1>ログ保存</h1>'}
    ${ownerInfo ? ownerInfo.outerHTML : ''}
    ${containerClone.outerHTML}
</body>
</html>`;

        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const timestamp = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0') +
            String(now.getSeconds()).padStart(2, '0');
        const safeRoomName = roomName.replace(/[\\/:*?"<>|]/g, '_') || 'room';

        a.href = url;
        a.download = `${safeRoomName}-${timestamp}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
