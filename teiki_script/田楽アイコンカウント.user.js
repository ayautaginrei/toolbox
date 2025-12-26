// ==UserScript==
// @name         田楽アイコンカウント
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  31番以降のアイコンはプロフィール欄には表示されませんからね
// @author       ayautaginrei(Gemini)
// @match        https://ironbunny.net/digi_nir/mypage.php?mode=profile*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const addNumbersToIcons = () => {
        // 登録済みアイコンのリストアイテムを取得
        const iconListItems = document.querySelectorAll('.prof_iconlist li');

        iconListItems.forEach((li, index) => {
            const label = li.querySelector('label');
            const img = li.querySelector('img.ic_thumb');

            if (label && img && !label.querySelector('.icon-number-badge')) {
                // 1. レイアウト崩れ（改行）を防ぐためのスタイル設定
                Object.assign(label.style, {
                    display: 'flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                    width: '100%'
                });

                // 2. 番号表示用要素の作成
                const span = document.createElement('span');
                const num = (index + 1).toString().padStart(2, '0');

                span.innerText = num;
                span.className = 'icon-number-badge';

                // 3. 番号のスタイル設定
                Object.assign(span.style, {
                    fontWeight: 'bold',
                    fontFamily: 'monospace',
                    marginRight: '8px',
                    color: '#ddd',
                    fontSize: '0.9em',
                    flexShrink: '0'
                });

                img.before(span);
            }
        });
    };

    // 初期実行
    addNumbersToIcons();

    // 並び替え（sortstop）発生時に番号を振り直す
    window.addEventListener('load', () => {
        if (window.jQuery) {
            const $ = window.jQuery;
            $('.prof_iconlist').on('sortstop', () => {
                document.querySelectorAll('.icon-number-badge').forEach(el => el.remove());
                addNumbersToIcons();
            });
        }
    });

})();
