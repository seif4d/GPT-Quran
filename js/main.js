// --- Configuration and State ---
const ALL_SURAHS_META_PATH = 'allSurahsMeta.json';
const TAFSIR_BASE_PATH = 'tafseer'; // المسار الأساسي لمجلد التفسير
let allSurahsMeta = [];
const fetchedSurahsCache = {};
let currentChatID = `chat_init_${Date.now()}`;
const MAX_RECENT_CHATS = 7;
const MAX_SEARCH_RESULTS_DISPLAY = 7;
let currentZenModeSurahIndex = null;
let currentZenModeAyahNumber = null;

// --- DOM Elements ---
const sidebar = document.getElementById('sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle');
const messageArea = document.getElementById('message-area');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const zenModeOverlay = document.getElementById('zen-mode-overlay');
const zenAyahDisplay = document.getElementById('zen-ayah-display');
const zenSurahInfoDisplay = document.getElementById('zen-surah-info-display');
const zenCloseBtn = document.getElementById('zen-close-btn');
const navZenModeToggle = document.getElementById('nav-zen-mode-toggle');
const recentRecitationsListUI = document.getElementById('recent-recitations-list-ui');
const navNewChat = document.getElementById('nav-new-chat');
const chatInterfaceTitle = document.getElementById('chat-interface-title');
const khatmaProgressUI = document.createElement('div');

// --- Utility: Arabic Number Mapping ---
const arabicToIndianNumeralsMap = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

// --- Core Utility Functions ---
function arabicToIndianNumerals(strNum) {
    if (typeof strNum !== 'string' && typeof strNum !== 'number') return '';
    return String(strNum).replace(/[0-9]/g, (digit) => arabicToIndianNumeralsMap[+digit]);
}

function normalizeArabicText(text) {
    if (!text) return "";
    text = String(text);
    text = text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, ""); // Remove tashkeel
    text = text.replace(/\u0640/g, ""); // Remove tatweel
    text = text.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627"); // Normalize Alif
    text = text.replace(/\u0629/g, "\u0647"); // Normalize Ta' marbuta
    text = text.replace(/\u0649/g, "\u064A"); // Normalize Alif maqsura
    return text.trim().toLowerCase();
}

// --- Data Fetching & Matching Functions ---
async function fetchSurahData(surahIndexNumeric) {
    if (!surahIndexNumeric) return null;
    const filename = `surah/surah_${surahIndexNumeric}.json`;
    if (fetchedSurahsCache[surahIndexNumeric]) {
        return fetchedSurahsCache[surahIndexNumeric];
    }
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`فشل تحميل السورة (الحالة: ${response.status})`);
        const surahData = await response.json();
        fetchedSurahsCache[surahIndexNumeric] = surahData;
        return surahData;
    } catch (error) {
        console.error(`خطأ في جلب السورة ${surahIndexNumeric}:`, error);
        addMessageToChat(`عفواً، لم أتمكن من تحميل بيانات سورة رقم ${arabicToIndianNumerals(surahIndexNumeric)}.`, 'system', currentChatID, false, true);
        return null;
    }
}

async function fetchTafsir(surahIndex, ayahNumber) {
    if (!surahIndex || !ayahNumber) return null;
    const filename = `${TAFSIR_BASE_PATH}/${surahIndex}/${ayahNumber}.json`;
    try {
        const response = await fetch(filename);
        if (!response.ok) {
            if (response.status === 404) return null; // No tafsir file, not an error
            throw new Error(`فشل تحميل التفسير (الحالة: ${response.status})`);
        }
        return await response.json();
    } catch (error) {
        console.error(`خطأ في جلب التفسير للآية ${surahIndex}:${ayahNumber}:`, error);
        return { error: true, message: error.message };
    }
}

function findSurahMeta(identifier) {
    if (!allSurahsMeta || allSurahsMeta.length === 0) return null;
    const cleanedIdentifier = String(identifier).trim();
    if (/^([1-9]|[1-9]\d|10\d|11[0-4])$/.test(cleanedIdentifier)) {
        return allSurahsMeta.find(s => s.index === cleanedIdentifier);
    }
    const normalizedId = normalizeArabicText(cleanedIdentifier);
    return allSurahsMeta.find(s =>
        normalizeArabicText(s.name) === normalizedId ||
        (s.name_simple && normalizeArabicText(s.name_simple) === normalizedId) ||
        (s.englishName && normalizeArabicText(s.englishName) === normalizedId)
    ) || allSurahsMeta.find(s => normalizeArabicText(s.name).includes(normalizedId) && normalizedId.length >= 2);
}

function matchSurah(arabicQuery, lowerQuery) {
    return findSurahMeta(arabicQuery.replace(/^سورة\s*/, ''));
}


// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    showLoadingState(true, "جاري تهيئة \"قرآني معاي\"...");
    try {
        const response = await fetch(ALL_SURAHS_META_PATH);
        if (!response.ok) throw new Error(`فشل تحميل ملف البيانات الأساسي.`);
        allSurahsMeta = await response.json();
        if (!Array.isArray(allSurahsMeta) || allSurahsMeta.length === 0) {
            throw new Error("ملف بيانات السور فارغ أو بتنسيق غير صحيح.");
        }
    } catch (error) {
        console.error("خطأ حرج:", error);
        displayCriticalError(`حدث خطأ جسيم: ${error.message}<br>قد لا يعمل التطبيق. الرجاء إعادة تحميل الصفحة.`);
        showLoadingState(false);
        return;
    }
    setupEventListeners();
    initializeChatSession();
    updateRecentChatsUI();
    setupKhatmaUI();
    setupZenModeNavigation();
    showLoadingState(false);
    userInput.focus();
});

function showLoadingState(isLoading, message = "جاري التحميل...") {
    const overlayId = 'app-loading-overlay';
    let overlay = document.getElementById(overlayId);
    if (isLoading) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.innerHTML = `<div>${message}</div><div class="loading-dots"><span></span><span></span><span></span></div>`;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        requestAnimationFrame(() => overlay.style.opacity = '1');
    } else if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.style.display = 'none', 350);
    }
}

function displayCriticalError(message) {
    messageArea.innerHTML = `<div class="message-bubble system error">${message}</div>`;
    userInput.disabled = true;
    sendBtn.disabled = true;
    userInput.placeholder = "التطبيق معطل حاليًا.";
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    sidebarToggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    sendBtn.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserInput();
        }
    });
    navZenModeToggle.addEventListener('click', handleZenModeToggle);
    zenCloseBtn.addEventListener('click', () => zenModeOverlay.style.display = 'none');
    navNewChat.addEventListener('click', (e) => {
        e.preventDefault();
        startNewChat();
    });
    document.querySelectorAll('#sidebar-other-nav li a').forEach(link => {
        if (link.id !== 'nav-zen-mode-toggle' && link.id !== 'nav-khatma') {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                setActiveSidebarLink(this);
                addMessageToChat(`ميزة "${this.textContent.trim().split('\n')[0]}" قيد التطوير 🚧، ستكون متاحة قريبًا.`, 'system', currentChatID);
                if (window.innerWidth <= 768) sidebar.classList.remove('open');
            });
        }
    });
    messageArea.addEventListener('click', handleMessageAreaClick);
}

function setActiveSidebarLink(activeLink) {
    document.querySelectorAll('#sidebar nav ul li a, .recent-recitations-list li').forEach(l => l.classList.remove('active'));
    if (activeLink) activeLink.classList.add('active');
}

// --- Ayah Interaction & Tafsir ---
async function handleAyahToolAction(action, surahIndex, ayahNumberStr, bubbleElement) {
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) return;

    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahName = surahMeta ? surahMeta.name : `سورة ${surahIndex}`;
    const ayahNumDisplay = arabicToIndianNumerals(ayahNumberStr);

    switch (action) {
        case 'tafsir_quick':
        case 'tafsir':
            const existingTafsir = bubbleElement.nextElementSibling;
            if (existingTafsir && existingTafsir.classList.contains('tafsir-bubble')) {
                existingTafsir.remove();
                return;
            }
            showLoadingState(true, `جاري تحميل التفسير...`);
            const tafsirData = await fetchTafsir(surahIndex, ayahNumber);
            showLoadingState(false);
            
            const tafsirBubble = document.createElement('div');
            tafsirBubble.classList.add('message-bubble', 'system', 'tafsir-bubble');

            if (tafsirData && tafsirData.text) {
                tafsirBubble.innerHTML = `
                    <div class="tafsir-header">تفسير الآية ${ayahNumDisplay} من سورة ${surahName}:</div>
                    <div class="tafsir-text">${tafsirData.text.replace(/\n/g, '<br>')}</div>`;
            } else if (tafsirData && tafsirData.error) {
                tafsirBubble.innerHTML = `عفواً، لم أتمكن من تحميل التفسير. <small>(${tafsirData.message})</small>`;
                tafsirBubble.classList.add('error');
            } else {
                tafsirBubble.innerHTML = `لم يتم العثور على تفسير لهذه الآية في البيانات المتوفرة.`;
            }
            bubbleElement.insertAdjacentElement('afterend', tafsirBubble);
            tafsirBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
        
        case 'copy_ayah':
            const surahDataForCopy = fetchedSurahsCache[surahIndex];
            const textToCopy = `﴿${surahDataForCopy.verse[`verse_${ayahNumber}`]}﴾ [${surahName}: ${ayahNumDisplay}]`;
            navigator.clipboard.writeText(textToCopy)
                .then(() => addTemporarySystemMessage("تم نسخ الآية بنجاح ✅", bubbleElement))
                .catch(() => addTemporarySystemMessage("فشل النسخ ❌", bubbleElement, true));
            break;

        case 'play_single':
        case 'play_ayah':
            addMessageToChat(`ميزة الاستماع 🎧 للآية ${ayahNumDisplay} من ${surahName} قيد التطوير.`, 'system', currentChatID);
            break;

        case 'zen_this':
            if (surahIndex && ayahNumber) fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            break;
            
        case 'share':
             const surahDataForShare = fetchedSurahsCache[surahIndex];
             if (surahDataForShare && surahDataForShare.verse[`verse_${ayahNumber}`]) {
                 const textToShare = `﴿${surahDataForShare.verse[`verse_${ayahNumber}`]}﴾ [${surahName}: ${ayahNumDisplay}] - من تطبيق قرآني معاي`;
                 if (navigator.share) {
                     navigator.share({ title: `آية من القرآن الكريم`, text: textToShare });
                 } else {
                     navigator.clipboard.writeText(textToShare)
                         .then(() => addMessageToChat('تم نسخ نص الآية لمشاركتها. 📝', 'system', currentChatID));
                 }
             }
             break;
        default: console.warn("Unhandled tool action:", action);
    }
}

function handleMessageAreaClick(event) {
    const clickedAyahTextElement = event.target.closest('.ayah-text');
    if (!clickedAyahTextElement) return;

    const parentBubble = clickedAyahTextElement.closest('.message-bubble.quran');
    if (!parentBubble) return;

    // Toggle quick tools
    let quickToolsDiv = parentBubble.querySelector('.ayah-quick-tools');
    if (quickToolsDiv) {
        quickToolsDiv.remove();
        return;
    }
    document.querySelectorAll('.ayah-quick-tools').forEach(el => el.remove());

    const surahIndex = clickedAyahTextElement.dataset.surahIdx;
    const ayahNumber = clickedAyahTextElement.dataset.ayahNum;

    if (surahIndex && ayahNumber) {
        quickToolsDiv = document.createElement('div');
        quickToolsDiv.className = 'ayah-quick-tools';
        quickToolsDiv.innerHTML = `
            <button class="tool-btn" data-action="copy_ayah" title="نسخ الآية">📋 نسخ</button>
            <button class="tool-btn" data-action="tafsir_quick" title="تفسير الآية">📖 تفسير</button>
            <button class="tool-btn" data-action="play_ayah" title="استماع (قيد التطوير)">🎧 استماع</button>
            <button class="tool-btn" data-action="zen_this" title="عرض في وضع الخشوع">🧘 خشوع</button>
        `;
        clickedAyahTextElement.insertAdjacentElement('afterend', quickToolsDiv);
        
        quickToolsDiv.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.closest('button').dataset.action;
                handleAyahToolAction(action, surahIndex, ayahNumber, parentBubble);
                if (quickToolsDiv.parentNode) quickToolsDiv.remove();
            });
        });
    }
}

function addTemporarySystemMessage(message, referenceElement, isError = false) {
    if (!referenceElement || !referenceElement.parentNode) return;
    let tempMsg = referenceElement.querySelector('.temp-system-msg');
    if(tempMsg) tempMsg.remove();
    
    tempMsg = document.createElement('div');
    tempMsg.className = 'temp-system-msg';
    tempMsg.textContent = message;
    tempMsg.style.cssText = `position: absolute; bottom: -5px; left: 50%; transform: translate(-50%, 100%); background-color: ${isError ? 'var(--accent-error-red)' : 'var(--accent-pulsar-green)'}; color: var(--bg-deep-space); padding: 5px 10px; border-radius: var(--border-radius-md); font-size: 0.8em; z-index: 10; opacity:0; transition: all 0.3s ease; box-shadow: var(--shadow-card); white-space:nowrap; font-weight: 500;`;
    if(getComputedStyle(referenceElement).position === 'static'){
        referenceElement.style.position = 'relative';
    }
    referenceElement.appendChild(tempMsg);
    
    requestAnimationFrame(() => {
        tempMsg.style.opacity = '1';
        tempMsg.style.transform = 'translate(-50%, calc(100% + 5px))';
    });
    setTimeout(() => {
        if(tempMsg && tempMsg.parentNode){
            tempMsg.style.opacity = '0';
            setTimeout(() => tempMsg.remove(), 300);
        }
    }, 2500);
}

// --- Chat UI, Logic, and Storage ---
function initializeChatSession() {
    const lastActiveChatID = localStorage.getItem('quranLastActiveChatID');
    let initialGreetingNeeded = true;
    if (lastActiveChatID && localStorage.getItem(lastActiveChatID)) {
        currentChatID = lastActiveChatID;
        loadChatHistory(currentChatID);
        initialGreetingNeeded = messageArea.children.length === 0;
    } else {
        startNewChat(false);
        initialGreetingNeeded = messageArea.children.length === 0;
    }
    if (initialGreetingNeeded && allSurahsMeta.length > 0) {
        addMessageToChat("السلام عليكم ورحمة الله. أنا \"قرآني معاي\"، رفيقك في رحلة تدبر كلام الله. 📖✨ كيف يمكنني مساعدتك؟", "system", currentChatID);
    }
    updateChatTitle(currentChatID);
}

function startNewChat(addGreeting = true) {
    currentChatID = `chat_${Date.now()}`;
    localStorage.setItem('quranLastActiveChatID', currentChatID);
    messageArea.innerHTML = '';
    if (addGreeting) {
        addMessageToChat("أهلاً بك في محادثة جديدة. ✨ ماذا في خاطرك اليوم؟", "system", currentChatID);
    }
    updateRecentChatsUI();
    updateChatTitle(currentChatID);
    userInput.value = '';
    userInput.focus();
    setActiveSidebarLink(navNewChat);
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

function loadChatHistory(chatID) {
    const history = JSON.parse(localStorage.getItem(chatID) || '[]');
    messageArea.innerHTML = '';
    history.forEach(msg => addMessageToChat(msg.content, msg.sender, chatID, msg.isHtml, false));
    messageArea.scrollTop = messageArea.scrollHeight;
    localStorage.setItem('quranLastActiveChatID', chatID);
    updateChatTitle(chatID);
}

function saveMessageToHistory(chatID, sender, content, isHtml = false) {
    if (!chatID) return;
    const history = JSON.parse(localStorage.getItem(chatID) || '[]');
    history.push({ sender, content, isHtml, timestamp: Date.now() });
    localStorage.setItem(chatID, JSON.stringify(history));

    let previewContent = isHtml ? content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : content;
    if (sender === 'user' && history.filter(m => m.sender === 'user').length <= 1) {
        updateRecentChatTimestampAndPreview(chatID, previewContent);
    } else if (history.length === 1) {
        updateRecentChatTimestampAndPreview(chatID, "محادثة جديدة");
    } else {
        updateRecentChatTimestampAndPreview(chatID);
    }

    if (sender === 'quran' && isHtml) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const lastAyahEl = Array.from(tempDiv.querySelectorAll('.ayah-text[data-surah-idx]')).pop();
        if (lastAyahEl) {
            saveLastReadAyah(chatID, lastAyahEl.dataset.surahIdx, parseInt(lastAyahEl.dataset.ayahNum));
        }
    }
}

function saveLastReadAyah(chatID, surahIndex, ayahNumber) {
    localStorage.setItem(`lastRead_${chatID}`, JSON.stringify({ surahIndex, ayahNumber }));
}

function getLastReadAyah(chatID) {
    return JSON.parse(localStorage.getItem(`lastRead_${chatID}`) || 'null');
}

function updateRecentChatTimestampAndPreview(chatID, previewTextParam) {
    let recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    let chatInfo = recentChats.find(c => c.id === chatID);
    if (chatInfo) {
        chatInfo.timestamp = Date.now();
        if (previewTextParam) chatInfo.preview = (previewTextParam || '').substring(0, 35) + (previewTextParam.length > 35 ? '...' : '');
        recentChats = recentChats.filter(c => c.id !== chatID);
        recentChats.unshift(chatInfo);
    } else {
        let preview = previewTextParam || 'محادثة جديدة';
        recentChats.unshift({ id: chatID, timestamp: Date.now(), preview: preview.substring(0, 35) + (preview.length > 35 ? '...' : '') });
    }
    localStorage.setItem('quranRecentChats', JSON.stringify(recentChats.slice(0, MAX_RECENT_CHATS)));
    updateRecentChatsUI();
}

function updateRecentChatsUI() {
    const recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    recentRecitationsListUI.innerHTML = '';
    recentChats.forEach(chat => {
        const li = document.createElement('li');
        li.textContent = chat.preview;
        li.dataset.chatId = chat.id;
        li.title = `${chat.preview}\n${new Date(chat.timestamp).toLocaleString('ar-EG')}`;
        if (chat.id === currentChatID) li.classList.add('active');
        li.addEventListener('click', () => {
            currentChatID = chat.id;
            loadChatHistory(chat.id);
            setActiveSidebarLink(li);
            if (window.innerWidth <= 768) sidebar.classList.remove('open');
        });
        recentRecitationsListUI.appendChild(li);
    });
    if (!recentChats.some(c => c.id === currentChatID)) {
        setActiveSidebarLink(navNewChat);
    }
}

function updateChatTitle(chatID) {
    const recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    const currentChatInfo = recentChats.find(c => c.id === chatID);
    chatInterfaceTitle.textContent = (currentChatInfo && currentChatInfo.preview) || "محادثة جديدة";
}

function handleUserInput() {
    const query = userInput.value.trim();
    if (!query) return;
    addMessageToChat(query, 'user', currentChatID);
    userInput.value = '';
    processQuranQuery(query);
}

function addMessageToChat(content, sender, chatID, isHtml = false, doSave = true) {
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', sender);
    if (isHtml) {
        bubble.innerHTML = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    } else {
        bubble.textContent = content;
    }
    if (sender === 'system' && (content.includes('خطأ') || content.includes('فشل'))) {
        bubble.classList.add('error');
    }
    messageArea.appendChild(bubble);
    messageArea.scrollTop = messageArea.scrollHeight;
    if (doSave) saveMessageToHistory(chatID, sender, content, isHtml);
    return bubble;
}

function addTypingIndicator() {
    return addMessageToChat(`<div class="loading-dots"><span></span><span></span><span></span></div>`, 'quran', currentChatID, true, false);
}

// --- Main Query Processing Engine ---
async function processQuranQuery(query) {
    const typingIndicator = addTypingIndicator();
    let responseSent = false;
    try {
        await new Promise(resolve => setTimeout(resolve, 300));

        const arabicQuery = query;
        const lowerQuery = query.toLowerCase();

        // --- Handle Follow-up Command ---
        if (["تابع", "اكمل", "متابعة"].some(s => normalizeArabicText(arabicQuery).includes(s))) {
            const lastRead = getLastReadAyah(currentChatID);
            if (lastRead && lastRead.surahIndex && lastRead.ayahNumber) {
                const surahMeta = allSurahsMeta.find(s => s.index === lastRead.surahIndex);
                if (surahMeta) {
                    addMessageToChat(`حسناً، لنتابع من بعد الآية ${arabicToIndianNumerals(lastRead.ayahNumber)} من سورة ${surahMeta.name}.`, 'system', currentChatID);
                    let nextAyahNum = lastRead.ayahNumber + 1;
                    if (nextAyahNum <= surahMeta.verses) {
                        await fetchAndDisplaySingleAyah(lastRead.surahIndex, String(nextAyahNum), currentChatID);
                    } else {
                        addMessageToChat(`ما شاء الله، لقد أتممت سورة ${surahMeta.name}. 🌸`, 'system', currentChatID);
                    }
                    responseSent = true;
                }
            }
        }
        // --- Handle Surah/Ayah Requests ---
        if (!responseSent) {
            const ayahRequestMatch = parseAyahRequest(arabicQuery);
            if (ayahRequestMatch) {
                await fetchAndDisplaySingleAyah(ayahRequestMatch.surahIndex, ayahRequestMatch.ayahNumber.toString(), currentChatID);
                responseSent = true;
            } else {
                const surahMatch = matchSurah(arabicQuery, lowerQuery);
                if (surahMatch) {
                    await displayFullSurah(surahMatch.index, currentChatID);
                    responseSent = true;
                }
            }
        }
        // --- Handle Keyword Search ---
        if (!responseSent) {
            const searchKeyword = extractSearchKeyword(arabicQuery);
            if (searchKeyword) {
                await searchKeywordInQuran(searchKeyword, currentChatID);
                responseSent = true;
            }
        }
        // --- Handle Greetings & Fallbacks ---
        if (!responseSent) {
            if (["السلام عليكم", "مرحبا", "اهلا"].some(s => arabicQuery.includes(s))) {
                addMessageToChat("وعليكم السلام ورحمة الله وبركاته. أهلاً بك. 🙏", "system", currentChatID);
            } else if (["شكرا", "جزاك الله خيرا"].some(s => arabicQuery.includes(s))) {
                addMessageToChat("وإياكم، بارك الله فيكم. في الخدمة دائمًا. 😊", "system", currentChatID);
            } else {
                addMessageToChat("عفواً، لم أفهم طلبك. 😅 جرب طلب سورة (مثل 'البقرة')، أو آية ('البقرة 255')، أو ابحث عن موضوع ('آيات عن الصبر').", "system", currentChatID);
            }
        }
    } catch (error) {
        console.error("Error processing query:", error);
        addMessageToChat("أعتذر، حدث خطأ غير متوقع. 😥 الرجاء المحاولة مرة أخرى.", "system", currentChatID);
    } finally {
        if (typingIndicator) typingIndicator.remove();
    }
}

function extractSearchKeyword(query) {
    const match = query.match(/^(?:آيات عن|ابحث عن|ماذا يقول القرآن عن)\s*(.+)/i);
    return match ? match[1].trim() : null;
}

function parseAyahRequest(query) {
    const famousAyahs = { "اية الكرسي": { s: "2", a: "255" }, "آية الكرسي": { s: "2", a: "255" } };
    for (const name in famousAyahs) {
        if (normalizeArabicText(query).includes(normalizeArabicText(name))) {
            return { surahIndex: famousAyahs[name].s, ayahNumber: parseInt(famousAyahs[name].a) };
        }
    }
    const match = query.match(/(?:سورة\s*)?([^\d\s]+)\s*(?:آية|اية|رقم)?\s*(\d+)/);
    if (match) {
        const surahMeta = findSurahMeta(match[1].trim());
        const ayahNum = parseInt(match[2].trim());
        if (surahMeta && ayahNum > 0 && ayahNum <= surahMeta.verses) {
            return { surahIndex: surahMeta.index, ayahNumber: ayahNum };
        }
    }
    return null;
}

async function searchKeywordInQuran(keyword, chatID) {
    addMessageToChat(`جاري البحث عن آيات تتعلق بـ "${keyword}"... ⏳`, 'system', chatID);
    let resultsBuffer = [];
    const normalizedKeyword = normalizeArabicText(keyword);
    for (const surahMeta of allSurahsMeta) {
        if (resultsBuffer.length >= MAX_SEARCH_RESULTS_DISPLAY) break;
        const surahData = await fetchSurahData(surahMeta.index);
        if (!surahData) continue;
        for (const key in surahData.verse) {
            if (normalizeArabicText(surahData.verse[key]).includes(normalizedKeyword)) {
                const verseNum = parseInt(key.split('_')[1]);
                if (verseNum === 0) continue;
                const highlightedText = surahData.verse[key].replace(new RegExp(keyword, 'gi'), `<span class="highlight">$&</span>`);
                resultsBuffer.push(`<div class="ayah-text" data-surah-idx="${surahMeta.index}" data-ayah-num="${verseNum}">${highlightedText} <span class="ayah-number-symbol">﴿${arabicToIndianNumerals(verseNum)}﴾</span></div><div class="surah-info">${surahMeta.name}: ${arabicToIndianNumerals(verseNum)}</div>`);
                if (resultsBuffer.length >= MAX_SEARCH_RESULTS_DISPLAY) break;
            }
        }
    }
    if (resultsBuffer.length > 0) {
        addMessageToChat(`وجدت ${arabicToIndianNumerals(resultsBuffer.length)} آية. إليك أبرزها:`, 'system', chatID);
        resultsBuffer.forEach(html => addMessageToChat(html, 'quran', chatID, true));
    } else {
        addMessageToChat(`لم أعثر على آيات تذكر "${keyword}" بشكل مباشر.`, 'system', chatID);
    }
}

async function fetchAndDisplaySingleAyah(surahIndex, ayahNumberStr, chatID) {
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahData = await fetchSurahData(surahIndex);
    if (!surahData || !surahMeta) return;

    const verseText = surahData.verse[`verse_${ayahNumberStr}`];
    if (verseText) {
        const ayahNumDisplay = arabicToIndianNumerals(ayahNumberStr);
        const content = `
            <div class="ayah-text" data-surah-idx="${surahIndex}" data-ayah-num="${ayahNumberStr}">${verseText} <span class="ayah-number-symbol">﴿${ayahNumDisplay}﴾</span></div>
            <div class="surah-info">سورة ${surahMeta.name} - الآية ${ayahNumDisplay}</div>
            <div class="ayah-tools">
                <button class="tool-btn" data-action="tafsir" title="تفسير"><span class="icon">📖</span> تفسير</button>
                <button class="tool-btn" data-action="play_single" title="استماع (قيد التطوير)"><span class="icon">🎧</span> استماع</button>
                <button class="tool-btn" data-action="share" title="مشاركة"><span class="icon">📤</span> مشاركة</button>
                <button class="tool-btn" data-action="zen_this" title="خشوع"><span class="icon">🧘</span> خشوع</button>
            </div>`;
        const bubble = addMessageToChat(content, 'quran', chatID, true);
        bubble.querySelector('.ayah-tools').querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => handleAyahToolAction(e.currentTarget.dataset.action, surahIndex, ayahNumberStr, bubble));
        });
    }
}

async function displayFullSurah(surahIndex, chatID) {
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahData = await fetchSurahData(surahIndex);
    if (!surahData || !surahMeta) return;

    addMessageToChat(`جاري عرض سورة ${surahMeta.name} كاملة...`, 'system', chatID);
    let bismillahHTML = (surahIndex !== "009" && surahIndex !== "001") ? `<span class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span>` : '';
    let ayahsHTML = Object.keys(surahData.verse)
        .map(key => parseInt(key.split('_')[1]))
        .filter(num => num > 0)
        .sort((a, b) => a - b)
        .map(num => `<span class="ayah-text" data-surah-idx="${surahIndex}" data-ayah-num="${num}">${surahData.verse['verse_' + num]} <span class="ayah-number-symbol">﴿${arabicToIndianNumerals(num)}﴾</span></span>`)
        .join(' ');
    
    addMessageToChat(`${bismillahHTML}<div class="surah-info">${surahMeta.name}</div>${ayahsHTML}`, 'quran', chatID, true);
    updateKhatmaProgressOnSurahView(surahIndex);
}

// --- Zen Mode ---
function setupZenModeNavigation() {
    const zenNavPrev = document.createElement('button');
    const zenNavNext = document.createElement('button');
    zenNavPrev.id = 'zen-nav-prev';
    zenNavNext.id = 'zen-nav-next';
    zenNavPrev.innerHTML = "❯"; // Right arrow for Previous in RTL
    zenNavNext.innerHTML = "❮"; // Left arrow for Next in RTL
    [zenNavPrev, zenNavNext].forEach(btn => {
        btn.className = 'zen-nav-btn';
        zenModeOverlay.appendChild(btn);
    });
    zenNavPrev.addEventListener('click', () => navigateZenAyah(-1));
    zenNavNext.addEventListener('click', () => navigateZenAyah(1));
}

async function handleZenModeToggle(e) {
    e.preventDefault();
    let target = currentZenModeSurahIndex ? { s: currentZenModeSurahIndex, a: currentZenModeAyahNumber } : getLastReadAyah(currentChatID);
    if (!target) {
        const randomSurah = allSurahsMeta[Math.floor(Math.random() * 114)];
        target = { s: randomSurah.index, a: Math.ceil(Math.random() * randomSurah.verses) };
    }
    await fetchAndDisplayZenAyah(target.s, target.a);
    if (window.innerWidth <= 768) sidebar.classList.remove('open');
}

async function fetchAndDisplayZenAyah(surahIndex, ayahNumber) {
    showLoadingState(true, "جاري تجهيز وضع الخشوع 🧘");
    const surahData = await fetchSurahData(surahIndex);
    showLoadingState(false);
    if (!surahData) {
        displayInZenMode("عفواً، لم أتمكن من تحميل السورة.", "خطأ");
        return;
    }
    const verseText = surahData.verse[`verse_${ayahNumber}`];
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    if (verseText && surahMeta) {
        currentZenModeSurahIndex = surahIndex;
        currentZenModeAyahNumber = ayahNumber;
        displayInZenMode(verseText, `سورة ${surahMeta.name} - الآية ${arabicToIndianNumerals(ayahNumber)}`);
    }
}

function displayInZenMode(ayahText, surahInfo) {
    zenAyahDisplay.textContent = ayahText;
    zenSurahInfoDisplay.textContent = surahInfo;
    zenModeOverlay.style.display = 'flex';
    [zenAyahDisplay, zenSurahInfoDisplay].forEach(el => {
        el.style.animation = 'none';
        requestAnimationFrame(() => el.style.animation = '');
    });
}

function navigateZenAyah(direction) {
    if (!currentZenModeSurahIndex) return;
    let surahMeta = allSurahsMeta.find(s => s.index === currentZenModeSurahIndex);
    let newAyah = currentZenModeAyahNumber + direction;
    let newSurahIndex = currentZenModeSurahIndex;
    
    if (newAyah < 1) {
        newSurahIndex = String(parseInt(newSurahIndex) === 1 ? 114 : parseInt(newSurahIndex) - 1);
        surahMeta = allSurahsMeta.find(s => s.index === newSurahIndex);
        newAyah = surahMeta.verses;
    } else if (newAyah > surahMeta.verses) {
        newSurahIndex = String(parseInt(newSurahIndex) === 114 ? 1 : parseInt(newSurahIndex) + 1);
        newAyah = 1;
    }
    fetchAndDisplayZenAyah(newSurahIndex, newAyah);
}

// --- Khatma Progress ---
function setupKhatmaUI() {
    khatmaProgressUI.id = 'khatma-progress-ui';
    khatmaProgressUI.innerHTML = `
        <span class="khatma-title">ختمتي الحالية</span>
        <div class="progress-bar-container" title="نسبة الإنجاز (بناءً على السور المعروضة)">
            <div class="progress-bar-fill"></div>
        </div>
        <div class="progress-text">0%</div>`;
    document.getElementById('nav-khatma').parentElement.insertAdjacentElement('afterend', khatmaProgressUI);
    updateKhatmaProgressDisplay();
}

function getKhatmaProgress() {
    const readSurahs = JSON.parse(localStorage.getItem('quranKhatmaReadSurahs') || '{}');
    return (Object.keys(readSurahs).length / 114) * 100;
}

function updateKhatmaProgressOnSurahView(surahIndex) {
    let readSurahs = JSON.parse(localStorage.getItem('quranKhatmaReadSurahs') || '{}');
    if (!readSurahs[surahIndex]) {
        readSurahs[surahIndex] = true;
        localStorage.setItem('quranKhatmaReadSurahs', JSON.stringify(readSurahs));
        updateKhatmaProgressDisplay();
    }
}

function updateKhatmaProgressDisplay() {
    const percentage = getKhatmaProgress();
    const fillBar = khatmaProgressUI.querySelector('.progress-bar-fill');
    const textDisplay = khatmaProgressUI.querySelector('.progress-text');
    if (fillBar) fillBar.style.width = `${percentage.toFixed(1)}%`;
    if (textDisplay) textDisplay.textContent = `${arabicToIndianNumerals(percentage.toFixed(1))}%`;
}
