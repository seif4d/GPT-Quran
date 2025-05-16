// --- Configuration and State ---
const ALL_SURAHS_META_PATH = 'allSurahsMeta.json'; 
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
const voiceInputBtn = document.getElementById('voice-input-btn');
const zenModeOverlay = document.getElementById('zen-mode-overlay');
const zenAyahDisplay = document.getElementById('zen-ayah-display');
const zenSurahInfoDisplay = document.getElementById('zen-surah-info-display');
const zenCloseBtn = document.getElementById('zen-close-btn');
const navZenModeToggle = document.getElementById('nav-zen-mode-toggle');
const recentRecitationsListUI = document.getElementById('recent-recitations-list-ui');
const navNewChat = document.getElementById('nav-new-chat');
const chatInterfaceTitle = document.getElementById('chat-interface-title');
const zenNavPrev = document.createElement('button');
const zenNavNext = document.createElement('button');
const khatmaProgressUI = document.createElement('div'); 

// --- Utility: Arabic Number Mapping ---
const indianToArabicNumeralsMap = { '۰':'0', '۱':'1', '۲':'2', '۳':'3', '۴':'4', '۵':'5', '۶':'6', '۷':'7', '۸':'8', '۹':'9'};
const arabicToIndianNumeralsMap = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

// --- Core Utility Functions (Moved Up for guaranteed availability) ---
function arabicToIndianNumerals(strNum) {
    if (typeof strNum !== 'string' && typeof strNum !== 'number') return '';
    return String(strNum).replace(/[0-9]/g, (digit) => arabicToIndianNumeralsMap[+digit]);
}

function normalizeArabicText(text) {
    if (!text) return "";
    text = String(text); 
    text = text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "");
    text = text.replace(/\u0640/g, "");
    text = text.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627"); 
    text = text.replace(/\u0629/g, "\u0647"); 
    text = text.replace(/\u0649/g, "\u064A"); 
    return text.trim().toLowerCase();
}

// --- Data Fetching & Matching Functions (Moved Up) ---
async function fetchSurahData(surahIndexNumeric) {
    if (!surahIndexNumeric) {
        console.error("fetchSurahData called with invalid surahIndex:", surahIndexNumeric);
        return null;
    }
    const filename = `surah/surah_${surahIndexNumeric}.json`; 
    
    if (fetchedSurahsCache[surahIndexNumeric]) {
        return fetchedSurahsCache[surahIndexNumeric];
    }
    try {
        const response = await fetch(filename);
        if (!response.ok) {
            let errorDetail = `الحالة: ${response.status}. المسار: ${filename}`;
            if (response.status === 404) errorDetail = `ملف السورة (${filename}) غير موجود أو المسار خطأ.`;
            throw new Error(`فشل تحميل بيانات السورة. ${errorDetail}`);
        }
        const surahData = await response.json();
        fetchedSurahsCache[surahIndexNumeric] = surahData;
        return surahData;
    } catch (error) {
        console.error(`خطأ في جلب السورة ${surahIndexNumeric} (${filename}):`, error);
        if (typeof addMessageToChat === 'function' && currentChatID) {
             addMessageToChat(`عفوًا، لم أتمكن من تحميل بيانات سورة رقم ${arabicToIndianNumerals(surahIndexNumeric.toString())} حاليًا.<br><small>الخطأ التقني: ${error.message}</small>`, 'system', currentChatID, true, true);
        }
        return null;
    }
}

function findSurahMeta(identifier) {
    if (!allSurahsMeta || allSurahsMeta.length === 0) {
        console.warn("findSurahMeta called but allSurahsMeta is not populated.");
        return null;
    }
    const cleanedIdentifier = String(identifier).trim();

    if (/^([1-9]|[1-9]\d|10\d|11[0-4])$/.test(cleanedIdentifier)) {
        const byIndex = allSurahsMeta.find(s => s.index === cleanedIdentifier);
        if (byIndex) return byIndex;
    }
    
    const normalizedId = normalizeArabicText(cleanedIdentifier);
    for (const surah of allSurahsMeta) {
        const normSurahName = normalizeArabicText(surah.name);
        const normSurahNameSimple = surah.name_simple ? normalizeArabicText(surah.name_simple) : "";
        const normEnglishName = surah.englishName ? normalizeArabicText(surah.englishName) : "";

        if (normSurahName === normalizedId ||
            (normSurahNameSimple && normSurahNameSimple === normalizedId) ||
            (normEnglishName && normEnglishName === normalizedId)) {
            return surah;
        }
    }

    for (const surah of allSurahsMeta) {
        const normSurahName = normalizeArabicText(surah.name);
        if (normSurahName.includes(normalizedId) && normalizedId.length >= 2) { 
            console.log(`Lenient match found for "${cleanedIdentifier}" -> "${surah.name}" (Index: ${surah.index})`);
            return surah;
        }
    }
    return null;
}

function matchSurah(arabicQuery, lowerQuery) {
    if (!allSurahsMeta || allSurahsMeta.length === 0) return null;

    const normalizedArabicQuery = normalizeArabicText(arabicQuery.replace(/^سورة\s*/, ''));
    const normalizedLowerQuery = normalizeArabicText(lowerQuery.replace(/^surah\s*/, ''));

    if (/^([1-9]|[1-9]\d|10\d|11[0-4])$/.test(normalizedArabicQuery)) {
        const byIndex = allSurahsMeta.find(s => s.index === normalizedArabicQuery);
        if (byIndex) return byIndex;
    }
    
    for (const surah of allSurahsMeta) {
        const normSurahName = normalizeArabicText(surah.name);
        const normSurahNameSimple = surah.name_simple ? normalizeArabicText(surah.name_simple) : "";
        const normEnglishName = surah.englishName ? normalizeArabicText(surah.englishName) : "";

        if (normSurahName === normalizedArabicQuery ||
            (normSurahNameSimple && normSurahNameSimple === normalizedArabicQuery) ||
            (normEnglishName && normEnglishName === normalizedLowerQuery)) {
            return surah;
        }
    }
     for (const surah of allSurahsMeta) {
         if ((normalizeArabicText(surah.name).includes(normalizedArabicQuery) || (surah.name_simple && normalizeArabicText(surah.name_simple).includes(normalizedArabicQuery))) && normalizedArabicQuery.length >= 2) {
            return surah; 
        }
    }
    return null;
}

// --- Ayah Interaction Tools (Definition Moved Up) ---
function handleAyahToolAction(action, surahIndex, ayahNumberStr) {
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) return;

    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahName = surahMeta ? surahMeta.name : `سورة ${surahIndex}`;
    const fullRef = `[${surahName}: ${arabicToIndianNumerals(ayahNumber.toString())}]`;

    // Find the corresponding ayahTextContent. This requires knowing the bubble or fetching.
    // For simplicity, assume the context (bubbleElement) might need to be passed or text fetched again.
    // Let's assume text will be fetched or passed.
    // const ayahTextContent = "..." // This would be the actual text of the Ayah.

    switch(action){
        case 'copy_ayah':
            const surahDataForCopy = fetchedSurahsCache[surahIndex];
            if (surahDataForCopy && surahDataForCopy.verse[`verse_${ayahNumber}`]) {
                const textToCopy = `﴿${surahDataForCopy.verse[`verse_${ayahNumber}`]}﴾ ${fullRef}`;
                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                         // Find the button's parent bubble to show the message. This part is tricky.
                         // For now, general message.
                        addMessageToChat("تم نسخ الآية بنجاح.", 'system', currentChatID, false, false);
                    })
                    .catch(err => addMessageToChat("حدث خطأ أثناء النسخ!", 'system', currentChatID, false, false));
            } else {
                addMessageToChat("لم أتمكن من جلب نص الآية للنسخ.", 'system', currentChatID, false, false);
            }
            break;
        case 'tafsir_quick':
        case 'play_single':
             addMessageToChat(`ميزة (${action === 'tafsir_quick' ? 'التفسير السريع' : 'الاستماع'}) للآية ${arabicToIndianNumerals(ayahNumber.toString())} من ${surahName} قيد الإعداد، ستتوفر قريبًا بإذن الله.`, 'system', currentChatID);
            break;
        case 'zen_this':
             if (surahIndex && ayahNumber) {
                fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            }
            break;
        default: console.warn("Unhandled ayah tool action:", action);
    }
}

function attachAyahToolListeners(toolsContainer) {
    if (!toolsContainer) {
        console.warn("attachAyahToolListeners called with no toolsContainer.");
        return;
    }
    toolsContainer.querySelectorAll('.tool-btn').forEach(button => {
        const newButton = button.cloneNode(true); 
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetButton = e.target.closest('button');
            if (!targetButton) return;
            const action = targetButton.dataset.action;
            
            const bubble = targetButton.closest('.message-bubble.quran');
            if (!bubble) { console.error("Parent Quran bubble not found for tool."); return; }

            const surahInfoEl = bubble.querySelector('.surah-info[data-surah-index][data-ayah-number]');
            const ayahTextEl = bubble.querySelector('.ayah-text[data-surah-idx][data-ayah-num]');
            
            let surahIndex, ayahNumber;
            if (surahInfoEl) {
                surahIndex = surahInfoEl.dataset.surahIndex;
                ayahNumber = surahInfoEl.dataset.ayahNumber;
            } else if (ayahTextEl) {
                surahIndex = ayahTextEl.dataset.surahIdx;
                ayahNumber = ayahTextEl.dataset.ayahNum;
            }

            if (surahIndex && ayahNumber) {
                handleAyahToolAction(action, surahIndex, ayahNumber);
            } else {
                console.error("No surah/ayah data for tool action on:", targetButton);
                addMessageToChat("عفواً، لم أستطع تحديد الآية لتنفيذ هذا الإجراء.", 'system', currentChatID);
            }
        });
    });
}


// --- Initialization (DOMContentLoaded and its helpers) ---
// showLoadingState, displayCriticalError are placed before they are called.

function showLoadingState(isLoading, message = "جاري التحميل...") { /* ... (as defined before) ... */
    const overlayId = 'app-loading-overlay';
    let overlay = document.getElementById(overlayId);
    if (isLoading) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = overlayId;
            overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(13, 17, 23, 0.92); z-index: 9999; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: var(--font-ui); color: var(--accent-primary); font-size: 1.4rem; text-align: center; backdrop-filter: blur(7px); -webkit-backdrop-filter: blur(7px); opacity: 0; transition: opacity 0.35s ease-in-out;`;
            overlay.innerHTML = `<div style="margin-bottom: 18px; font-weight: 500;">${message}</div><div class="loading-dots global-loader"><span></span><span></span><span></span></div>`;
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        requestAnimationFrame(() => requestAnimationFrame(() => { if(overlay) overlay.style.opacity = '1'; })); // Double rAF for smoother transition start
    } else {
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(() => { if(overlay) overlay.style.display = 'none'; }, 350);
        }
    }
}

function displayCriticalError(message) { /* ... (as defined before) ... */
    messageArea.innerHTML = `<div class="message-bubble system error" style="text-align: right; border-color: var(--accent-error); background-color: rgba(248, 81, 73, 0.15); color: #f89f9a;">${message}</div>`;
    userInput.disabled = true;
    sendBtn.disabled = true;
    userInput.placeholder = "التطبيق غير قادر على العمل حاليًا."
}

document.addEventListener('DOMContentLoaded', async () => {
    showLoadingState(true, "جاري تهيئة \"قرآني معاي\"...");
    try {
        const response = await fetch(ALL_SURAHS_META_PATH);
        if (!response.ok) throw new Error(`فشل تحميل ملف البيانات الأساسي (${ALL_SURAHS_META_PATH}). الحالة: ${response.status}`);
        allSurahsMeta = await response.json();
        if (!Array.isArray(allSurahsMeta) || allSurahsMeta.length === 0) {
            throw new Error("ملف بيانات وصف السور فارغ أو بتنسيق غير صحيح.");
        }
        console.log("تم تحميل بيانات وصف السور:", allSurahsMeta.length, "سورة.");
    } catch (error) {
        console.error("خطأ حرج عند تحميل بيانات السور:", error);
        displayCriticalError(`حدث خطأ جسيم أثناء تحميل البيانات الأساسية للتطبيق: ${error.message}<br>قد لا يعمل التطبيق بشكل صحيح. الرجاء التأكد من أن ملفات التطبيق (خاصة ${ALL_SURAHS_META_PATH}) موجودة وفي المسار الصحيح، ثم أعد تحميل الصفحة.`);
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

// --- Event Listeners Setup ---
function setupEventListeners() { /* ... (as defined before) ... */
    sidebarToggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    sendBtn.addEventListener('click', handleUserInput);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            handleUserInput();
        }
    });
    navZenModeToggle.addEventListener('click', handleZenModeToggle);
    zenCloseBtn.addEventListener('click', () => {
        zenModeOverlay.style.display = 'none';
        currentZenModeSurahIndex = null; 
        currentZenModeAyahNumber = null;
    });
    navNewChat.addEventListener('click', (e) => {
        e.preventDefault();
        startNewChat();
    });
    
    document.querySelectorAll('#sidebar-other-nav li a').forEach(link => {
        link.addEventListener('click', function(e) {
            if (this.id === 'nav-zen-mode-toggle') return;
            e.preventDefault();
            setActiveSidebarLink(this);
            addMessageToChat(`ميزة "${this.textContent.trim().split('\n')[0]}" قيد الإعداد والتطوير، ستكون متاحة قريبًا إن شاء الله تعالى.`, 'system', currentChatID);
            if(window.innerWidth <= 768) sidebar.classList.remove('open');
        });
    });
    messageArea.addEventListener('click', handleMessageAreaClick);
}

function setActiveSidebarLink(activeLink) { /* ... (as defined before) ... */
    document.querySelectorAll('#sidebar-main-nav li a, .recent-recitations-list li, #sidebar-other-nav li a').forEach(l => l.classList.remove('active'));
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// --- الذاكرة الروحية ---
function saveLastReadAyah(chatID, surahIndex, ayahNumber) { /* ... (as defined before) ... */
    if (!chatID || !surahIndex || isNaN(parseInt(ayahNumber))) return;
    const lastRead = { surahIndex, ayahNumber: parseInt(ayahNumber), timestamp: Date.now() };
    localStorage.setItem(`lastRead_${chatID}`, JSON.stringify(lastRead));
    console.log(`Last read for chat ${chatID}: Surah ${surahIndex}, Ayah ${ayahNumber}`);
}

function getLastReadAyah(chatID) { /* ... (as defined before) ... */
    if (!chatID) return null;
    const lastReadJSON = localStorage.getItem(`lastRead_${chatID}`);
    return lastReadJSON ? JSON.parse(lastReadJSON) : null;
}

// --- Chat UI & Logic ---
function initializeChatSession() { /* ... (as defined before) ... */
    const lastActiveChatID = localStorage.getItem('quranLastActiveChatID');
    let initialGreetingNeeded = true;

    if (lastActiveChatID && localStorage.getItem(lastActiveChatID)) {
        currentChatID = lastActiveChatID;
        loadChatHistory(currentChatID);
        initialGreetingNeeded = messageArea.children.length === 0;
        
        const lastRead = getLastReadAyah(currentChatID);
        if (lastRead && lastRead.surahIndex && lastRead.ayahNumber && allSurahsMeta.length > 0) {
            const surahMeta = allSurahsMeta.find(s => s.index === lastRead.surahIndex);
            if (surahMeta && messageArea.children.length < 3) { // Only suggest if chat is very short/new
                 setTimeout(() => {
                    addMessageToChat(
                        `مرحبًا بعودتك! آخر ما كنت تتصفحه هو الآية ${arabicToIndianNumerals(lastRead.ayahNumber.toString())} من سورة ${surahMeta.name}. هل تود المتابعة من هناك؟ <br> (اكتب "نعم، تابع" أو "متابعة")`,
                        'system', currentChatID, true
                    );
                }, 1500);
            }
        }
    } else {
        startNewChat(false); 
        initialGreetingNeeded = messageArea.children.length === 0;
    }

    if (initialGreetingNeeded && messageArea.children.length === 0 && allSurahsMeta.length > 0) { // only greet if meta loaded and no errors
         addMessageToChat("السلام عليكم ورحمة الله وبركاته. أنا \"قرآني معاي\"، رفيقك في رحلة تدبر كلام الله. كيف يمكنني مساعدتك اليوم؟ يمكنك طلب سورة، آية، أو السؤال عن موضوع.", "system", currentChatID);
    }
    updateChatTitle(currentChatID);
}

function startNewChat(addGreeting = true) { /* ... (as defined before) ... */
    const newChatId = `chat_${Date.now()}`;
    if (currentChatID === newChatId && messageArea.children.length > 0) return; // Avoid redundant new chat

    currentChatID = newChatId;
    localStorage.setItem('quranLastActiveChatID', currentChatID);
    messageArea.innerHTML = ''; 
    if(addGreeting || (messageArea.children.length === 0 && allSurahsMeta.length > 0)){
        addMessageToChat("السلام عليكم ورحمة الله وبركاته. أهلاً بك في محادثة جديدة مع \"قرآني معاي\". ماذا في خاطرك اليوم؟", "system", currentChatID);
    }
    updateRecentChatsUI(); 
    updateChatTitle(currentChatID); 
    userInput.value = '';
    userInput.focus();
    setActiveSidebarLink(navNewChat);
    if(window.innerWidth <= 768 && sidebar.classList.contains('open')) sidebar.classList.remove('open');
}

function loadChatHistory(chatID) { /* ... (as defined before) ... */
    const historyJSON = localStorage.getItem(chatID);
    if (!historyJSON) return; // No history for this ID
    const history = JSON.parse(historyJSON);
    messageArea.innerHTML = ''; 
    history.forEach(msg => addMessageToChat(msg.content, msg.sender, chatID, msg.isHtml, false));
    if (messageArea.children.length > 0) {
      messageArea.scrollTop = messageArea.scrollHeight;
    }
    localStorage.setItem('quranLastActiveChatID', chatID); // Confirm this is the active one
    updateChatTitle(chatID);
}

function saveMessageToHistory(chatID, sender, content, isHtml = false) { /* ... (as defined before) ... */
    if(!chatID) return; 
    const history = JSON.parse(localStorage.getItem(chatID)) || [];
    const messageEntry = { sender, content, isHtml, timestamp: Date.now() };
    history.push(messageEntry);
    localStorage.setItem(chatID, JSON.stringify(history));
    
    let previewContent = content;
    if (isHtml) { 
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        previewContent = tempDiv.textContent || tempDiv.innerText || "";
    }
    if (sender === 'user' && history.filter(m => m.sender === 'user').length <= 1) { // Update preview for first *user* message
         updateRecentChatTimestampAndPreview(chatID, previewContent);
    } else if (history.length === 1 && sender === 'system') { // For the very first system greeting
         updateRecentChatTimestampAndPreview(chatID, "محادثة جديدة");
    } else {
         updateRecentChatTimestampAndPreview(chatID); // Only update timestamp
    }

    // Save last read ayah
    if(sender === 'quran' && isHtml){
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const surahInfoEl = tempDiv.querySelector('.surah-info[data-surah-index][data-ayah-number]');
        const ayahTextEl = tempDiv.querySelector('.ayah-text[data-surah-idx][data-ayah-num]');
        
        if (surahInfoEl) {
            saveLastReadAyah(chatID, surahInfoEl.dataset.surahIndex, surahInfoEl.dataset.ayahNumber);
        } else if (ayahTextEl) { 
             saveLastReadAyah(chatID, ayahTextEl.dataset.surahIdx, ayahTextEl.dataset.ayahNum);
        } else { 
            const lastAyahNumSpan = Array.from(tempDiv.querySelectorAll('.ayah-text span[style*="font-family:var(--font-ui)"]')).pop();
            const fullSurahInfoEl = tempDiv.querySelector('.surah-info[data-surah-index-for-full]');
            if (lastAyahNumSpan && fullSurahInfoEl) {
                 const lastAyahNumText = lastAyahNumSpan.textContent.replace(/[﴿﴾]/g,'').trim();
                 const lastAyahNum = parseInt(Object.keys(indianToArabicNumeralsMap).find(key => indianToArabicNumeralsMap[key] === lastAyahNumText) || lastAyahNumText);
                 if(!isNaN(lastAyahNum)) saveLastReadAyah(chatID, fullSurahInfoEl.dataset.surahIndexForFull, lastAyahNum);
            }
        }
    }
}

function updateRecentChatTimestampAndPreview(chatID, previewTextParam = null) { /* ... (as defined before) ... */
    if(!chatID) return;
    let recentChats = JSON.parse(localStorage.getItem('quranRecentChats')) || [];
    const chatIndex = recentChats.findIndex(c => c.id === chatID);
    
    let finalPreview = previewTextParam;
    if (finalPreview === null || typeof finalPreview === 'undefined') { // Only try to fetch if not explicitly given (null means update timestamp only)
        if (chatIndex > -1 && recentChats[chatIndex].preview) {
            finalPreview = recentChats[chatIndex].preview; // Keep existing preview if not overriding
        } else {
            const history = JSON.parse(localStorage.getItem(chatID)) || [];
            const firstUserMsg = history.find(m => m.sender === 'user');
            if (firstUserMsg) {
                 const tempDiv = document.createElement('div');
                 tempDiv.innerHTML = firstUserMsg.isHtml ? firstUserMsg.content : `<p>${firstUserMsg.content}</p>`;
                 finalPreview = tempDiv.textContent || tempDiv.innerText || "";
            } else {
                 finalPreview = "محادثة جديدة";
            }
        }
    }
    finalPreview = String(finalPreview).replace(/\n/g, ' ').substring(0, 30) + (String(finalPreview).length > 30 ? '...' : '');

    if (chatIndex > -1) {
        recentChats[chatIndex].timestamp = Date.now();
        if (previewTextParam !== null) recentChats[chatIndex].preview = finalPreview; // Update preview only if one was provided
        const item = recentChats.splice(chatIndex, 1)[0];
        recentChats.unshift(item);
    } else {
        const history = JSON.parse(localStorage.getItem(chatID)) || [];
        if(history.length > 0 || finalPreview === "محادثة جديدة") { // Add to recent chats if there is history or it's a designated new chat.
            recentChats.unshift({ id: chatID, timestamp: Date.now(), preview: finalPreview });
        }
    }
    if (recentChats.length > MAX_RECENT_CHATS) recentChats = recentChats.slice(0, MAX_RECENT_CHATS);
    localStorage.setItem('quranRecentChats', JSON.stringify(recentChats));
    updateRecentChatsUI();
}

function updateRecentChatsUI() { /* ... (as defined before) ... */
    const recentChats = JSON.parse(localStorage.getItem('quranRecentChats')) || [];
    recentRecitationsListUI.innerHTML = ''; 
    let activeLiElement = null;

    recentChats.forEach(chat => {
        const li = document.createElement('li');
        li.textContent = chat.preview || `محادثة (${new Date(chat.timestamp).toLocaleTimeString('ar-EG', {hour:'numeric', minute:'numeric'})})`;
        li.dataset.chatId = chat.id;
        li.title = `${chat.preview}\n${new Date(chat.timestamp).toLocaleString('ar-EG', {dateStyle:'short', timeStyle:'short'})}`;
        li.addEventListener('click', () => {
            if (currentChatID === chat.id && messageArea.children.length > 0) return;
            currentChatID = chat.id;
            loadChatHistory(chat.id);
            setActiveSidebarLink(li);
            if(window.innerWidth <= 768) sidebar.classList.remove('open');
            userInput.focus();
        });
        if (chat.id === currentChatID) {
            activeLiElement = li;
        }
        recentRecitationsListUI.appendChild(li);
    });
    
    if (activeLiElement) {
        setActiveSidebarLink(activeLiElement);
    } else {
        setActiveSidebarLink(navNewChat);
    }
}

function updateChatTitle(chatID) { /* ... (as defined before) ... */
    if (!chatID) { chatInterfaceTitle.textContent = "قرآني معاي"; return;}
    const recentChats = JSON.parse(localStorage.getItem('quranRecentChats')) || [];
    const currentChatInfo = recentChats.find(c => c.id === chatID);
    let titleText = "محادثة مع القرآن"; 
    if(currentChatInfo && currentChatInfo.preview && currentChatInfo.preview !== "محادثة جديدة"){
        titleText = currentChatInfo.preview;
    } else {
         const history = JSON.parse(localStorage.getItem(chatID)) || [];
         if(history.length === 0 && (chatID.startsWith("chat_init_") || !localStorage.getItem(chatID))){
             titleText = "محادثة جديدة";
         } else if (history.length > 0) {
            const firstUserMsg = history.find(m => m.sender === 'user');
            if(firstUserMsg){
                let tempPreview = firstUserMsg.isHtml ? (new DOMParser().parseFromString(firstUserMsg.content, 'text/html').body.textContent || "") : firstUserMsg.content;
                titleText = tempPreview.substring(0, 30) + (tempPreview.length > 30 ? '...' : '');
            }
         }
    }
    chatInterfaceTitle.textContent = titleText;
}

function handleUserInput() { /* ... (as defined before) ... */
    const query = userInput.value.trim();
    if (!query) return;
    
    const history = JSON.parse(localStorage.getItem(currentChatID)) || [];
    const isFirstUserMessage = history.filter(msg => msg.sender === 'user').length === 0;
    if (isFirstUserMessage && query) { // If it is the very first user message of this chat
        updateRecentChatTimestampAndPreview(currentChatID, query);
        updateChatTitle(currentChatID); // update title immediately
    }

    addMessageToChat(query, 'user', currentChatID);
    userInput.value = ''; 
    processQuranQuery(query);
}

function addMessageToChat(content, sender, chatID, isHtml = false, doSave = true) { /* ... (as defined before) ... */
    if(!chatID && doSave) { console.warn("No ChatID for saving message:", content); return; }
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', sender);
    if (sender === 'system' && (String(content).toLowerCase().includes('خطأ') || String(content).toLowerCase().includes('فشل'))) {
        bubble.classList.add('error');
    }
    if (isHtml) {
        const cleanContent = String(content).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
        bubble.innerHTML = cleanContent;
    } else {
        bubble.textContent = content;
    }
    messageArea.appendChild(bubble);
    if (messageArea.children.length > 0) {
      messageArea.scrollTop = messageArea.scrollHeight;
    }
    if(doSave && chatID) saveMessageToHistory(chatID, sender, content, isHtml);
}

function addTypingIndicator() { /* ... (as defined before) ... */
    const typingBubble = document.createElement('div');
    typingBubble.classList.add('message-bubble', 'quran', 'typing-indicator');
    typingBubble.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`; 
    messageArea.appendChild(typingBubble);
    if (messageArea.children.length > 0) {
      messageArea.scrollTop = messageArea.scrollHeight;
    }
    return typingBubble;
}

// --- Ayah Interaction Tools ---
function handleMessageAreaClick(event) { /* ... (as defined before, with corrected tool retrieval logic) ... */
    const clickedAyahTextElement = event.target.closest('.ayah-text');
    if (!clickedAyahTextElement) return;

    const parentBubble = clickedAyahTextElement.closest('.message-bubble.quran');
    if (!parentBubble) return;

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
            <button class="tool-btn" data-action="tafsir_quick" title="تفسير (قيد التطوير)">📖 تفسير</button>
            <button class="tool-btn" data-action="play_ayah" title="استماع (قيد التطوير)">🎧 استماع</button>
            <button class="tool-btn" data-action="zen_this" title="عرض في وضع الخشوع">🧘 خشوع</button>
        `;
        
        const surahInfoElement = parentBubble.querySelector('.surah-info');
        if(surahInfoElement) {
            surahInfoElement.insertAdjacentElement('afterend', quickToolsDiv);
        } else {
             clickedAyahTextElement.insertAdjacentElement('afterend', quickToolsDiv);
        }
        
        quickToolsDiv.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation(); 
                const action = e.target.closest('button').dataset.action;
                const ayahTextOnly = clickedAyahTextElement.cloneNode(true);
                const ayahNumberSpan = ayahTextOnly.querySelector('span[style*="font-family:var(--font-ui)"]');
                if(ayahNumberSpan) ayahNumberSpan.remove();

                handleAyahQuickToolAction(action, surahIndex, ayahNumber, ayahTextOnly.textContent.trim(), parentBubble);
                if(quickToolsDiv && quickToolsDiv.parentNode) quickToolsDiv.remove(); // Check parentNode before remove
            });
        });
    }
}

function handleAyahQuickToolAction(action, surahIndex, ayahNumberStr, ayahTextContent, bubbleElement) { /* ... (as defined before) ... */
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) return;

    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahName = surahMeta ? surahMeta.name : `سورة ${surahIndex}`;
    const fullRef = `[${surahName}: ${arabicToIndianNumerals(ayahNumber.toString())}]`;

    switch(action){
        case 'copy_ayah':
            navigator.clipboard.writeText(`﴿${ayahTextContent}﴾ ${fullRef}`)
                .then(() => addTemporarySystemMessage("تم نسخ الآية بنجاح.", bubbleElement))
                .catch(err => addTemporarySystemMessage("حدث خطأ أثناء النسخ!", bubbleElement, true));
            break;
        case 'tafsir_quick':
        case 'play_ayah':
             addMessageToChat(`ميزة (${action === 'tafsir_quick' ? 'التفسير السريع' : 'الاستماع'}) للآية ${arabicToIndianNumerals(ayahNumber.toString())} من ${surahName} قيد الإعداد، ستتوفر قريبًا بإذن الله.`, 'system', currentChatID);
            break;
        case 'zen_this':
             if (surahIndex && ayahNumber) {
                fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            }
            break;
        default: console.warn("Unhandled quick tool action:", action);
    }
}

function addTemporarySystemMessage(message, referenceElement, isError = false) { /* ... (as defined before, added parentNode check) ... */
    if(!referenceElement || !referenceElement.parentNode) { return;}
    const tempMsgId = 'temp-system-msg-' + Date.now(); 
    
    const existingOldMsg = referenceElement.querySelector('[id^="temp-system-msg-"]');
    if (existingOldMsg) existingOldMsg.remove();

    const tempMsg = document.createElement('div');
    tempMsg.id = tempMsgId;
    tempMsg.textContent = message;
    tempMsg.style.cssText = `position: absolute; bottom: 0px; left: 50%; transform: translate(-50%, 100%); background-color: ${isError ? 'var(--accent-error)' : 'var(--accent-secondary)'}; color: white; padding: 5px 10px; border-radius: var(--border-radius-md); font-size: 0.8em; z-index: 10; opacity:0; transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out; box-shadow: 0 2px 5px rgba(0,0,0,0.25); white-space:nowrap;`;
    if(referenceElement.style.position !== 'absolute' && referenceElement.style.position !== 'fixed' && referenceElement.style.position !== 'relative'){
      referenceElement.style.position = 'relative'; // Ensure parent is positioned for absolute child
    }
    referenceElement.appendChild(tempMsg);
    
    requestAnimationFrame(() => {
        tempMsg.style.opacity = '1';
        tempMsg.style.transform = 'translate(-50%, calc(100% + 5px))';
    }); 
    setTimeout(() => {
        if(tempMsg && tempMsg.parentNode){
            tempMsg.style.opacity = '0';
            tempMsg.style.transform = 'translate(-50%, 100%)';
            setTimeout(() => {if(tempMsg && tempMsg.parentNode) tempMsg.remove();}, 300);
        }
    }, 2800);
}

// --- Main Query Processing (This is where matchSurah was called from) ---
async function processQuranQuery(query) {
    if (allSurahsMeta.length === 0) {
        addMessageToChat("أعتذر، لا يمكنني معالجة طلبك حاليًا بسبب مشكلة في تحميل البيانات الأساسية للقرآن. يرجى التأكد من اتصالك بالإنترنت وإعادة تحميل الصفحة.", "system", currentChatID);
        return;
    }
    const typingIndicator = addTypingIndicator();
    let responseSent = false; 

    try {
        await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));

        const lowerQuery = query.toLowerCase();
        const arabicQuery = query; 

        if (["نعم تابع", "متابعة القراءة", "تابع", "كمل", "اكمل", "متابعه", "نعم", "ايوه"].some(s => normalizeArabicText(arabicQuery).includes(normalizeArabicText(s)))) {
            const lastRead = getLastReadAyah(currentChatID);
            if (lastRead && lastRead.surahIndex && lastRead.ayahNumber) {
                const surahMeta = allSurahsMeta.find(s => s.index === lastRead.surahIndex);
                if (surahMeta) {
                    addMessageToChat(`حسنًا، لنتابع القراءة من بعد الآية ${arabicToIndianNumerals(lastRead.ayahNumber.toString())} من سورة ${surahMeta.name}.`, 'system', currentChatID);
                    let nextAyahNum = lastRead.ayahNumber + 1;
                    if (nextAyahNum <= surahMeta.verses) {
                        await fetchAndDisplaySingleAyah(lastRead.surahIndex, nextAyahNum.toString(), currentChatID);
                    } else {
                        const currentSurahNum = parseInt(lastRead.surahIndex);
                        if (currentSurahNum < 114) {
                            const nextSurahMeta = allSurahsMeta.find(s => parseInt(s.index) === currentSurahNum + 1);
                            if(nextSurahMeta) addMessageToChat(`ما شاء الله، لقد أتممت سورة ${surahMeta.name}. هل تود البدء في تلاوة السورة التالية، سورة ${nextSurahMeta.name}؟ (اكتب "نعم، سورة ${nextSurahMeta.name}")`, 'system', currentChatID);
                            else addMessageToChat(`لقد وصلتَ لآخر سورة متاحة بعد ${surahMeta.name}.`, 'system', currentChatID);
                        } else {
                            addMessageToChat(`تبارك الله، لقد وصلتَ لآخر آية في المصحف الشريف في هذه الجلسة، سورة الناس.`, 'system', currentChatID);
                        }
                    }
                    responseSent = true;
                }
            }
        }

        if (!responseSent) {
            const surahMatch = matchSurah(arabicQuery, lowerQuery); // <<<< استدعاء matchSurah
            if (surahMatch) {
                addMessageToChat(`سأعرض لك الآن سورة ${surahMatch.name} كاملة، بإذن الله:`, 'system', currentChatID);
                await displayFullSurah(surahMatch.index, currentChatID);
                updateKhatmaProgressOnSurahView(surahMatch.index);
                responseSent = true;
            }
        }

        if (!responseSent) {
            const ayahRequestMatch = parseAyahRequest(arabicQuery, lowerQuery);
            if (ayahRequestMatch) {
                const reqSurahMeta = allSurahsMeta.find(s => s.index === ayahRequestMatch.surahIndex);
                addMessageToChat(`جاري عرض الآية رقم ${arabicToIndianNumerals(ayahRequestMatch.ayahNumber.toString())} من سورة ${reqSurahMeta?.name || `رقم ${ayahRequestMatch.surahIndex}`}:`, 'system', currentChatID);
                await fetchAndDisplaySingleAyah(ayahRequestMatch.surahIndex, ayahRequestMatch.ayahNumber.toString(), currentChatID);
                responseSent = true;
            }
        }

        if (!responseSent) {
            const searchKeyword = extractSearchKeyword(arabicQuery);
            const commonKeywordsExpanded = ["صبر", "شكر", "رزق", "توبة", "استغفار", "زواج", "طلاق", "موت", "حياة", "جنة", "نار", "جهنم", "يوم القيامة", "الوالدين", "اليتيم", "فقراء", "الزكاة", "الحج", "الصلاة", "الربا", "توكل", "ايمان", "تقوى", "ظلم", "عدل", "صدق", "كذب", "رحمة", "غضب", "خوف", "امل", "علم", "جهل", "قلب", "نفس", "شفاء", "مرض", "سحر", "الطلاق", "الموت", "الحياة", "الجنة", "النار"];
            const effectiveKeyword = searchKeyword || commonKeywordsExpanded.find(kw => normalizeArabicText(arabicQuery).includes(normalizeArabicText(kw)));

            if (effectiveKeyword) {
                const searchLoaderBubble = addTypingIndicator(); 
                addMessageToChat(`لحظات من فضلك... أبحث لك عن آيات تتعلق بـ "${effectiveKeyword}". قد يستغرق هذا بعض الوقت...`, 'system', currentChatID, false, false);
                await searchKeywordInQuran(effectiveKeyword, currentChatID, searchLoaderBubble); 
                responseSent = true;
            }
        }
        
        if (!responseSent) {
            if (["السلام عليكم", "مرحبا", "اهلا", "سلام", "مساء الخير", "صباح الخير"].some(s => normalizeArabicText(arabicQuery).includes(normalizeArabicText(s)))) {
                addMessageToChat("وعليكم السلام ورحمة الله وبركاته. أهلاً وسهلاً بك في \"قرآني معاي\". كيف يمكنني أن أكون عوناً لك اليوم في رحلتك مع آيات الله؟", "quran", currentChatID);
                responseSent = true;
            } else if (["شكرا", "شكرا جزيلا", "جزاك الله خيرا", "جزاكم الله خيرا", "بارك الله فيك"].some(s => normalizeArabicText(arabicQuery).includes(normalizeArabicText(s)))) {
                addMessageToChat("العفو، وبارك الله فيكم ونفع بكم. هذا من فضل الله وتوفيقه. هل من خدمة أخرى أقدمها لك؟", "quran", currentChatID);
                responseSent = true;
            }
        }

        if (!responseSent) {
            const fallbackResponses = [
                "لم أفهم طلبك بالكامل، عفوًا. هل يمكنك صياغته بشكل أوضح؟ تستطيع طلب سورة (مثل 'سورة الفاتحة')، أو آية محددة (مثلاً 'البقرة آية 155')، أو البحث عن موضوع (مثل 'آيات عن الأمانة').",
                "سبحانك اللهم لا علم لنا إلا ما علمتنا. لم أتعرف على هذا الطلب بعد. جرب استخدام كلمات مختلفة أو اطلب سورة أو آية مباشرة.",
                "قد أحتاج إلى المزيد من التوضيح لفهم ما تبحث عنه. هل يمكنك أن تكون أكثر تحديدًا في طلبك المتعلق بالقرآن الكريم؟"
            ];
            addMessageToChat(fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)], 'quran', currentChatID);
        }

    } catch (error) {
        console.error("خطأ أثناء معالجة استعلام القرآن:", error);
        addMessageToChat("أعتذر بشدة، حدث خطأ غير متوقع أثناء محاولة معالجة طلبك. فريق التطوير يعمل على إصلاحه. الرجاء المحاولة مرة أخرى بعد قليل.", "system", currentChatID, false, true); 
    } finally {
        if (typingIndicator && typingIndicator.parentNode) typingIndicator.remove();
    }
}

// --- Keyword Extraction and Ayah Parsing (Moved up for potential use by processQuranQuery) ---
function extractSearchKeyword(query) { /* ... (as defined before) ... */
    const patterns = [
        /^(?:آيات|ايات|اية|آية|ابحث(?: لي)?|تكلم|حدثني)\s*(?:عن)?\s*(.+)/i, 
        /ماذا يقول القرآن عن (.+)/i,
        /ما حكم (.+) في القرآن/i,
        /قول الله في (.+)/i
    ];
    for (const pattern of patterns) {
        const match = query.match(pattern);
        if (match && match[match.length-1]) {
            return match[match.length-1].trim().replace(/[؟!\.]+$/, '').trim();
        }
    }
    return null; 
}

function parseAyahRequest(arabicQuery, lowerQuery) { /* ... (as defined before, calls findSurahMeta) ... */
    let surahIdentifier = null;
    let ayahNumberStr = null;
    const normalizedArabicQueryForAyah = normalizeArabicText(arabicQuery); 

    const famousAyahs = {
        "اية الكرسي": { surah: "2", ayah: "255" }, "آية الكرسي": { surah: "2", ayah: "255" },
        "اية النور": { surah: "24", ayah: "35" }, "آية النور": { surah: "24", ayah: "35" },
        "اية الدين": { surah: "2", ayah: "282" }, "آية الدين": { surah: "2", ayah: "282" },
    };
    for (const name in famousAyahs) {
        if (normalizedArabicQueryForAyah.includes(normalizeArabicText(name))) {
            return { surahIndex: famousAyahs[name].surah, ayahNumber: parseInt(famousAyahs[name].ayah) };
        }
    }

    const pattern1 = /(?:سورة\s*)?([^\s\dايهآيةرقم:ة\s]+ة?)\s*(?:آية|اية|ايه|رقم)\s*(\d+)|(\d+)\s*[:\-\s]\s*(\d+)/;
    let match = arabicQuery.match(pattern1); 
    if (!match) match = normalizedArabicQueryForAyah.match(pattern1);
    
    if (match) {
        if (match[1] && match[2]) { 
            surahIdentifier = match[1].trim();
            ayahNumberStr = match[2].trim();
        } else if (match[3] && match[4]) { 
            surahIdentifier = match[3].trim();
            ayahNumberStr = match[4].trim();
        }
    } else {
        const pattern2 = /(?:آية|اية|ايه|رقم)\s*(\d+)\s*(?:من|في|سورة)?\s*([^\s\d]+ة?)/; 
        match = arabicQuery.match(pattern2);
        if (!match) match = normalizedArabicQueryForAyah.match(pattern2);
        if (match && match[1] && match[2]) {
            ayahNumberStr = match[1].trim();
            surahIdentifier = match[2].trim();
        }
    }
    
    if (surahIdentifier && ayahNumberStr) {
        const surahMeta = findSurahMeta(surahIdentifier); // <<<< استدعاء findSurahMeta
        const ayahNumInt = parseInt(ayahNumberStr);
        if (surahMeta) {
             if (ayahNumInt > 0 && ayahNumInt <= surahMeta.verses) {
                return { surahIndex: surahMeta.index, ayahNumber: ayahNumInt };
            } else {
                addMessageToChat(`سورة ${surahMeta.name} تحتوي على ${arabicToIndianNumerals(surahMeta.verses.toString())} آية فقط. الآية رقم ${arabicToIndianNumerals(ayahNumberStr)} غير موجودة.`, 'system', currentChatID);
                return null;
            }
        } else {
             addMessageToChat(`لم أتعرف على السورة "${surahIdentifier}". الرجاء التأكد من الاسم أو رقم السورة الصحيح.`, 'system', currentChatID);
             return null;
        }
    }
    return null;
}

// --- Specific Ayah/Surah Display Functions ---
async function searchKeywordInQuran(keyword, chatID, loaderBubble = null) { /* ... (as defined before, calls fetchSurahData) ... */
    let foundAyahsCount = 0;
    const normalizedKeyword = normalizeArabicText(keyword);

    if (!normalizedKeyword) {
        if (loaderBubble && loaderBubble.parentNode) loaderBubble.remove();
        addMessageToChat(`الكلمة التي أدخلتها للبحث ("${keyword}") أصبحت فارغة بعد معالجتها. يرجى تجربة كلمة أخرى ذات معنى.`, 'system', chatID);
        return;
    }
    if(loaderBubble && !loaderBubble.parentNode){ 
        loaderBubble = addTypingIndicator();
    }
    
    let resultsBuffer = []; 
    const searchPromise = new Promise(async (resolveSearch) => {
        for (const surahMeta of allSurahsMeta) {
            if (resultsBuffer.length >= MAX_SEARCH_RESULTS_DISPLAY + 10) break; 
            
            const surahData = await fetchSurahData(surahMeta.index); // <<<< استدعاء fetchSurahData
            if (!surahData || !surahData.verse) continue;

            const verseKeys = Object.keys(surahData.verse).sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));

            for (const key of verseKeys) {
                if (key === 'verse_0' && surahData.index !== "001") continue; 

                const verseText = surahData.verse[key];
                const normalizedVerseText = normalizeArabicText(verseText);

                if (normalizedVerseText.includes(normalizedKeyword)) {
                    foundAyahsCount++; // Use this instead of resultsBuffer.length directly in loop condition
                    const verseNum = parseInt(key.split('_')[1]);
                    let displayText = verseText;
                    try { 
                        const keywordInstanceRegex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                        displayText = verseText.replace(keywordInstanceRegex, (match) => `<span class="highlight">${match}</span>`);
                    } catch(e){ console.warn("Highlighting regex error", e); }
                    
                    resultsBuffer.push({
                        html: `<div class="ayah-text" data-surah-idx="${surahMeta.index}" data-ayah-num="${verseNum}">${displayText} <span style="font-family:var(--font-ui); font-size:0.5em; color:var(--accent-primary);">﴿${arabicToIndianNumerals(verseNum.toString())}﴾</span></div>
                               <div class="surah-info" data-surah-index="${surahMeta.index}" data-ayah-number="${verseNum}">سورة ${surahMeta.name} - الآية ${arabicToIndianNumerals(verseNum.toString())}</div>`,
                    });
                }
                if (resultsBuffer.length >= MAX_SEARCH_RESULTS_DISPLAY + 10) break;
            }
        }
        resolveSearch();
    });
    
    const searchTimeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 10000)); 

    await Promise.race([searchPromise, searchTimeout]).then(async (result) => {
        if (loaderBubble && loaderBubble.parentNode) loaderBubble.remove();
        
        if (resultsBuffer.length === 0) {
            const timeoutMessage = result === 'timeout' ? "استغرق البحث وقتًا طويلاً." : "";
            addMessageToChat(`${timeoutMessage} لم أعثر على آيات تذكر كلمة "${keyword}" بشكل مباشر. قد تكون الكلمة ضمن سياق أعمق، أو بإملاء مختلف، أو أن الموضوع يتطلب بحثًا في كتب التفسير.`, 'system', chatID);
        } else {
            addMessageToChat(`بحمد الله، وجدت ${arabicToIndianNumerals(resultsBuffer.length.toString())} آية (أو أكثر) لها علاقة بـ "${keyword}". إليك أبرز ${arabicToIndianNumerals(Math.min(resultsBuffer.length, MAX_SEARCH_RESULTS_DISPLAY).toString())} نتيجة وجدتها:`, 'system', chatID);
            for (let i = 0; i < Math.min(resultsBuffer.length, MAX_SEARCH_RESULTS_DISPLAY); i++) {
                addMessageToChat(resultsBuffer[i].html, 'quran', chatID, true);
                 if (i < Math.min(resultsBuffer.length, MAX_SEARCH_RESULTS_DISPLAY) - 1) {
                  await new Promise(resolve_delay => setTimeout(resolve_delay, 100)); 
                }
            }
            if(resultsBuffer.length > MAX_SEARCH_RESULTS_DISPLAY){
                addMessageToChat(`هناك ${arabicToIndianNumerals((resultsBuffer.length - MAX_SEARCH_RESULTS_DISPLAY).toString())} نتيجة إضافية لم تعرض. إذا أردت رؤية المزيد، يمكنك تضييق نطاق بحثك أو استخدام كلمات أكثر دقة.`, 'system', chatID);
            }
        }
    });
}


async function fetchAndDisplaySingleAyah(surahIndexNumeric, ayahNumberStr, chatID) { /* ... (as defined before, calls fetchSurahData and attachAyahToolListeners) ... */
    const ayahNumber = parseInt(ayahNumberStr);
    if(!surahIndexNumeric || isNaN(ayahNumber)){
        addMessageToChat("لم أتمكن من تحديد الآية المطلوبة بشكل صحيح. يرجى التأكد من توفير رقم السورة والآية بشكل صحيح.", "system", currentChatID);
        return;
    }

    showLoadingState(true, `جاري تحميل الآية ${arabicToIndianNumerals(ayahNumber.toString())} من سورة ${allSurahsMeta.find(s=>s.index === surahIndexNumeric)?.name || ''}...`);
    const surahData = await fetchSurahData(surahIndexNumeric); // <<<< استدعاء fetchSurahData
    showLoadingState(false);

    if (!surahData) return; 

    const verseKey = `verse_${ayahNumber}`;
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndexNumeric);

    if (!surahMeta) {
        addMessageToChat(`معلومات السورة رقم ${arabicToIndianNumerals(surahIndexNumeric)} غير متوفرة لدي.`, 'system', currentChatID, true);
        return;
    }
    if (ayahNumber > surahMeta.verses || ayahNumber < 1) {
        addMessageToChat(`سورة ${surahMeta.name} تحتوي على ${arabicToIndianNumerals(surahMeta.verses.toString())} آية. الرقم ${arabicToIndianNumerals(ayahNumber.toString())} غير صحيح لهذه السورة.`, 'system', currentChatID, true);
        return;
    }

    if (surahData.verse.hasOwnProperty(verseKey)) {
        const verseText = surahData.verse[verseKey];
        const ayahNumDisplay = arabicToIndianNumerals(ayahNumber.toString());
        const ayahContent = `
            <div class="ayah-text" data-surah-idx="${surahIndexNumeric}" data-ayah-num="${ayahNumber}">${verseText} <span style="font-family:var(--font-ui); font-size:0.5em; color:var(--accent-primary);">﴿${ayahNumDisplay}﴾</span></div>
            <div class="surah-info" data-surah-index="${surahIndexNumeric}" data-ayah-number="${ayahNumber}">سورة ${surahMeta.name} - الآية ${ayahNumDisplay}</div>
            <div class="ayah-tools">
                <button class="tool-btn" data-action="tafsir" title="تفسير هذه الآية (قيد التطوير)">📖 تفسير</button>
                <button class="tool-btn" data-action="play_single" title="استمع لهذه الآية (قيد التطوير)">🎧 استماع</button>
                <button class="tool-btn" data-action="share" title="شارك هذه الآية">📤 مشاركة</button>
                <button class="tool-btn" data-action="zen_this" title="عرض في وضع الخشوع">🧘 خشوع</button>
            </div>
        `;
        addMessageToChat(ayahContent, 'quran', chatID, true);
        saveLastReadAyah(chatID, surahIndexNumeric, ayahNumber);
        const lastMessageBubble = messageArea.lastElementChild;
        if (lastMessageBubble) {
            const toolsContainer = lastMessageBubble.querySelector('.ayah-tools');
            if(toolsContainer) attachAyahToolListeners(toolsContainer); // <<<< استدعاء attachAyahToolListeners
        }
    } else { 
        addMessageToChat(`أعتذر، لم أجد نص الآية رقم ${arabicToIndianNumerals(ayahNumber.toString())} في سورة ${surahMeta.name} في البيانات الحالية.`, 'system', currentChatID, true);
    }
}

async function displayFullSurah(surahIndexNumeric, chatID) { /* ... (as defined before, calls fetchSurahData) ... */
    const surahMetaInitial = allSurahsMeta.find(s=>s.index === surahIndexNumeric);
    showLoadingState(true, `جاري تحميل سورة ${surahMetaInitial?.name || `رقم ${surahIndexNumeric}`} كاملة...`);
    const surahData = await fetchSurahData(surahIndexNumeric); // <<<< استدعاء fetchSurahData
    showLoadingState(false);

    if (!surahData) return; 
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndexNumeric); 

    let bismillahHTML = "";
    if (surahData.index !== "009") { 
        let bismillahText = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
        if (surahData.verse.hasOwnProperty('verse_0')) bismillahText = surahData.verse.verse_0;
        bismillahHTML = `<span class="bismillah">${bismillahText}</span>`;
    }
    addMessageToChat(`${bismillahHTML}<div class="surah-info" data-surah-index-for-full="${surahIndexNumeric}" data-surah-index="${surahIndexNumeric}" data-ayah-number="0">سورة ${surahMeta ? surahMeta.name : surahData.name}</div>`, "quran", chatID, true);

    const verseKeys = Object.keys(surahData.verse).sort((a, b) => parseInt(a.split('_')[1]) - parseInt(b.split('_')[1]));
    let lastDisplayedAyahNumberInSurah = 0;

    for (const key of verseKeys) {
        const verseNum = parseInt(key.split('_')[1]);
        if (key === 'verse_0' && surahData.index !== "001") continue; 
        
        const verseText = surahData.verse[key];
        lastDisplayedAyahNumberInSurah = verseNum; 

        const ayahContent = `
            <div class="ayah-text" data-surah-idx="${surahIndexNumeric}" data-ayah-num="${verseNum}">${verseText} <span style="font-family:var(--font-ui); font-size:0.5em; color:var(--accent-primary);">﴿${arabicToIndianNumerals(verseNum.toString())}﴾</span></div>`;
        addMessageToChat(ayahContent, 'quran', chatID, true);
        if (verseKeys.length > 15 && verseKeys.indexOf(key) % 10 === 0 && verseKeys.indexOf(key) > 0) {
             await new Promise(resolve => setTimeout(resolve, 30));
        } else if (verseKeys.length <= 15 && verseKeys.indexOf(key) < verseKeys.length -1 ) {
            await new Promise(resolve => setTimeout(resolve, 15));
        }
    }
    if(lastDisplayedAyahNumberInSurah > 0) {
        saveLastReadAyah(chatID, surahIndexNumeric, lastDisplayedAyahNumberInSurah);
    }
}


// --- Zen Mode ---
function setupZenModeNavigation() { /* ... (as defined before) ... */
    zenNavPrev.innerHTML = ""; 
    zenNavNext.innerHTML = ""; 
    [zenNavPrev, zenNavNext].forEach(btn => {
        btn.className = 'zen-nav-btn'; 
        zenModeOverlay.appendChild(btn);
    });
    zenNavPrev.style.right = 'clamp(15px, 4vw, 30px)';
    zenNavNext.style.left = 'clamp(15px, 4vw, 30px)';

    zenNavPrev.addEventListener('click', () => navigateZenAyah(-1)); 
    zenNavNext.addEventListener('click', () => navigateZenAyah(1));  
}

async function handleZenModeToggle(e) { /* ... (as defined before) ... */
    e.preventDefault();
    if (allSurahsMeta.length === 0) { return; }
    
    let targetSurah = currentZenModeSurahIndex;
    let targetAyah = currentZenModeAyahNumber;

    if (!targetSurah || !targetAyah) {
        const lastRead = getLastReadAyah(currentChatID);
        if (lastRead && lastRead.surahIndex && lastRead.ayahNumber) {
            targetSurah = lastRead.surahIndex;
            targetAyah = lastRead.ayahNumber;
        } else {
            const randomSurahIndex = Math.floor(Math.random() * allSurahsMeta.length);
            const randomSurah = allSurahsMeta[randomSurahIndex];
            targetSurah = randomSurah.index;
            targetAyah = Math.max(1, Math.ceil(Math.random() * randomSurah.verses)); 
        }
    }
    showLoadingState(true, "جاري تجهيز وضع الخشوع...");
    await fetchAndDisplayZenAyah(targetSurah, targetAyah);
    showLoadingState(false);
    if(window.innerWidth <= 768 && sidebar.classList.contains('open')) sidebar.classList.remove('open');
}

async function fetchAndDisplayZenAyah(surahIndex, ayahNumber) { /* ... (as defined before, calls fetchSurahData) ... */
    currentZenModeSurahIndex = surahIndex;
    currentZenModeAyahNumber = parseInt(ayahNumber);
    
    if(!surahIndex || isNaN(currentZenModeAyahNumber) || allSurahsMeta.length === 0){
         displayInZenMode("حدث خطأ في تحديد الآية المطلوبة.", "الرجاء إعادة المحاولة لاحقًا.");
         return;
    }
    const surahData = await fetchSurahData(surahIndex);  // <<<< استدعاء fetchSurahData
    if (!surahData) {
        displayInZenMode("عفوًا، لم أتمكن من تحميل السورة لهذه الآية.", "خطأ في التحميل");
        return;
    }

    const verseKey = `verse_${currentZenModeAyahNumber}`;
    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    if (surahData.verse.hasOwnProperty(verseKey) && surahMeta) {
        const verseText = surahData.verse[verseKey];
        displayInZenMode(verseText, `سورة ${surahMeta.name} - الآية ${arabicToIndianNumerals(currentZenModeAyahNumber.toString())}`);
    } else { 
        displayInZenMode("الآية المطلوبة غير موجودة في البيانات المتوفرة حاليًا.", `سورة ${surahMeta ? surahMeta.name : surahIndex} - آية ${arabicToIndianNumerals(currentZenModeAyahNumber.toString())}`);
    }
}

function displayInZenMode(ayahText, surahInfo) { /* ... (as defined before) ... */
    zenAyahDisplay.textContent = ayahText;
    zenSurahInfoDisplay.textContent = surahInfo;
    zenModeOverlay.style.display = 'flex';
    zenAyahDisplay.style.animation = 'none';
    zenSurahInfoDisplay.style.animation = 'none';
    requestAnimationFrame(() => { 
        requestAnimationFrame(() => {
             zenAyahDisplay.style.animation = 'fadeInText 1.3s ease-out forwards';
             zenSurahInfoDisplay.style.animation = 'fadeInText 1.3s ease-out 0.4s forwards';
        });
    });
}

function navigateZenAyah(direction) {  /* ... (as defined before) ... */
    if (!currentZenModeSurahIndex || currentZenModeAyahNumber === null || !allSurahsMeta.length) return;

    let currentSurahMeta = allSurahsMeta.find(s => s.index === currentZenModeSurahIndex);
    if (!currentSurahMeta) return;

    let newAyahNumber = currentZenModeAyahNumber + direction;
    let newSurahIndex = currentZenModeSurahIndex;

    if (newAyahNumber < 1) {
        let prevSurahNumAsInt = parseInt(currentZenModeSurahIndex) - 1;
        if (prevSurahNumAsInt < 1) prevSurahNumAsInt = 114; 
        newSurahIndex = prevSurahNumAsInt.toString();
        const prevSurahMeta = allSurahsMeta.find(s => s.index === newSurahIndex);
        newAyahNumber = prevSurahMeta ? prevSurahMeta.verses : 1;
    } else if (newAyahNumber > currentSurahMeta.verses) {
        let nextSurahNumAsInt = parseInt(currentZenModeSurahIndex) + 1;
        if (nextSurahNumAsInt > 114) nextSurahNumAsInt = 1;
        newSurahIndex = nextSurahNumAsInt.toString();
        newAyahNumber = 1;
    }
    fetchAndDisplayZenAyah(newSurahIndex, newAyahNumber);
}

// --- Khatma Progress ---
function setupKhatmaUI() { /* ... (as defined before) ... */
    khatmaProgressUI.id = 'khatma-progress-ui';
    khatmaProgressUI.innerHTML = `
        <div class="khatma-title" style="font-size:0.9em; color:var(--text-secondary); margin-bottom:8px; padding-top:10px; border-top:1px solid var(--border-color);">ختمتي الحالية:</div>
        <div class="progress-bar-container" title="نسبة الإنجاز في الختمة (بناءً على السور المعروضة)">
            <div class="progress-bar-fill"></div>
        </div>
        <div class="progress-text">0%</div>
    `;
    const khatmaNavItemAnchor = document.getElementById('nav-khatma');
    if (khatmaNavItemAnchor && khatmaNavItemAnchor.parentElement) {
      khatmaNavItemAnchor.parentElement.insertAdjacentElement('afterend', khatmaProgressUI);
    } else {
        const otherNavUl = sidebar.querySelector('#sidebar-other-nav ul'); 
        if (otherNavUl) {
            otherNavUl.appendChild(khatmaProgressUI); 
        } else if (sidebar.querySelector('#sidebar-other-nav')) {
            sidebar.querySelector('#sidebar-other-nav').appendChild(khatmaProgressUI);
        } else {
             sidebar.appendChild(khatmaProgressUI);
        }
    }
    updateKhatmaProgressDisplay();
}

function getKhatmaProgress() { /* ... (as defined before) ... */
    const readSurahs = JSON.parse(localStorage.getItem('quranKhatmaReadSurahs')) || {};
    const totalSurahs = allSurahsMeta.length > 0 ? allSurahsMeta.length : 114;
    const readCount = Object.keys(readSurahs).length;
    return totalSurahs > 0 ? (readCount / totalSurahs) * 100 : 0;
}

function updateKhatmaProgressOnSurahView(surahIndex) { /* ... (as defined before) ... */
    if (!surahIndex || allSurahsMeta.length === 0) return;
    let readSurahs = JSON.parse(localStorage.getItem('quranKhatmaReadSurahs')) || {};
    if (!readSurahs[surahIndex.toString()]) { 
        readSurahs[surahIndex.toString()] = true; 
        localStorage.setItem('quranKhatmaReadSurahs', JSON.stringify(readSurahs));
        updateKhatmaProgressDisplay();
    }
}

function updateKhatmaProgressDisplay() { /* ... (as defined before) ... */
    const khatmaUIEl = document.getElementById('khatma-progress-ui');
    if (!khatmaUIEl || allSurahsMeta.length === 0) return; 
    
    const percentage = getKhatmaProgress();
    const fillBar = khatmaUIEl.querySelector('.progress-bar-fill');
    const textDisplay = khatmaUIEl.querySelector('.progress-text');
    
    if (fillBar) fillBar.style.width = `${Math.min(100, percentage.toFixed(1))}%`;
    if (textDisplay) textDisplay.textContent = `${arabicToIndianNumerals(Math.min(100,percentage.toFixed(1)))}%`;
}
// --- (الكود السابق يبقى كما هو حتى هذا القسم) ---

// --- Constants for Paths (NEW) ---
const TAFSIR_BASE_PATH = 'tafseer'; // المسار الأساسي لمجلد التفسير

// --- (بقية الدوال المساعدة مثل arabicToIndianNumerals, normalizeArabicText, fetchSurahData, findSurahMeta, matchSurah) ---
// تأكد من أن هذه الدوال موجودة ومعرّفة بشكل صحيح قبل الدوال التي ستستخدمها.

// --- (يفضل وضعها مع الدوال المتعلقة بجلب البيانات) ---
async function fetchTafsir(surahIndex, ayahNumber) {
    if (!surahIndex || !ayahNumber) {
        console.error("fetchTafsir called with invalid parameters:", surahIndex, ayahNumber);
        return null;
    }
    // The surah folder names seem to be just the number (e.g., "1" for Al-Fatiha)
    // The ayah file names are also just the number (e.g., "1.json" for Ayah 1)
    const filename = `${TAFSIR_BASE_PATH}/${surahIndex}/${ayahNumber}.json`;
    
    try {
        const response = await fetch(filename);
        if (!response.ok) {
            // It's common for tafsir to not be available for every single verse,
            // especially the Basmalah if it's numbered as verse 0 or 1 in some schemas
            // but not considered a verse requiring its own tafsir file.
            if (response.status === 404) {
                console.log(`Tafsir file not found: ${filename}`);
                return null; // Return null to indicate no specific tafsir file, handle this gracefully
            }
            throw new Error(`فشل تحميل ملف التفسير (${filename}). الحالة: ${response.status}`);
        }
        const tafsirData = await response.json();
        return tafsirData; // Should contain { text, ayah, surah }
    } catch (error) {
        console.error(`خطأ في جلب التفسير للسورة ${surahIndex} الآية ${ayahNumber} (${filename}):`, error);
        // Don't add a chat message here directly, let the calling function handle UI for error
        return { error: true, message: error.message }; // Return an error object
    }
}


// --- (بقية دوال واجهة المستخدم والمحادثات) ---
// ...
// في دالة attachAyahToolListeners أو handleAyahQuickToolAction
// ...

// --- Ayah Interaction Tools (Updated `handleAyahQuickToolAction` for Tafsir) ---
async function handleAyahQuickToolAction(action, surahIndex, ayahNumberStr, ayahTextContent, bubbleElement) {
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) return;

    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahName = surahMeta ? surahMeta.name : `سورة ${surahIndex}`;
    const ayahNumDisplay = arabicToIndianNumerals(ayahNumber.toString());
    const fullRef = `[${surahName}: ${ayahNumDisplay}]`;

    switch(action){
        case 'copy_ayah':
            navigator.clipboard.writeText(`﴿${ayahTextContent}﴾ ${fullRef}`)
                .then(() => addTemporarySystemMessage("تم نسخ الآية بنجاح.", bubbleElement))
                .catch(err => addTemporarySystemMessage("حدث خطأ أثناء النسخ!", bubbleElement, true));
            break;
        case 'tafsir_quick': // <<< ACTION MODIFIED
            showLoadingState(true, `جاري تحميل تفسير الآية ${ayahNumDisplay} من سورة ${surahName}...`);
            const tafsirData = await fetchTafsir(surahIndex, ayahNumber);
            showLoadingState(false);

            if (tafsirData && tafsirData.text) {
                const tafsirContent = `
                    <div class="tafsir-header">تفسير الآية ${ayahNumDisplay} من سورة ${surahName}:</div>
                    <div class="tafsir-text">${tafsirData.text.replace(/\n/g, '<br>')}</div>
                `;
                // Add this tafsir as a new bubble from 'system' or a dedicated 'tafsir' sender type
                addMessageToChat(tafsirContent, 'system', currentChatID, true); // isHtml = true
            } else if (tafsirData && tafsirData.error) {
                addMessageToChat(`عفواً، لم أتمكن من تحميل التفسير حالياً. الخطأ: ${tafsirData.message}`, 'system', currentChatID, false, true);
            } else {
                addMessageToChat(`لم يتم العثور على تفسير لهذه الآية (${ayahNumDisplay} من سورة ${surahName}) في البيانات المتوفرة.`, 'system', currentChatID);
            }
            break;
        case 'play_ayah':
             addMessageToChat(`ميزة (${action === 'tafsir_quick' ? 'التفسير السريع' : 'الاستماع'}) للآية ${ayahNumDisplay} من ${surahName} قيد الإعداد، ستتوفر قريبًا بإذن الله.`, 'system', currentChatID);
            break;
        case 'zen_this':
             if (surahIndex && ayahNumber) {
                fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            }
            break;
        default: console.warn("Unknown quick tool action:", action);
    }
}

// ... (تأكد أن handleAyahToolAction تستدعي handleAyahQuickToolAction أو لها منطق مشابه)
// إذا كنت تستخدم `handleAyahToolAction` منفصلة لأزرار الأدوات الثابتة (إذا كانت موجودة)
// فستحتاج لتعديلها هي أيضًا لتشمل منطق جلب وعرض التفسير.

async function handleAyahToolAction(action, surahIndex, ayahNumberStr) { // Note: bubbleElement might be needed here too for temp messages
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) {
        console.warn("Invalid Ayah number for tool action:", ayahNumberStr);
        return;
    }

    const surahMeta = allSurahsMeta.find(s => s.index === surahIndex);
    const surahNameDisplay = surahMeta ? surahMeta.name : `سورة ${surahIndex}`;
    const ayahNumDisplay = arabicToIndianNumerals(ayahNumber.toString());

    switch (action) {
        case 'tafsir': // Action from static .ayah-tools
            showLoadingState(true, `جاري تحميل تفسير الآية ${ayahNumDisplay} من سورة ${surahNameDisplay}...`);
            const tafsirData = await fetchTafsir(surahIndex, ayahNumber);
            showLoadingState(false);

            if (tafsirData && tafsirData.text) {
                const tafsirContent = `
                    <div class="tafsir-header">تفسير الآية ${ayahNumDisplay} من سورة ${surahNameDisplay}:</div>
                    <div class="tafsir-text">${tafsirData.text.replace(/\n/g, '<br>')}</div>
                `;
                addMessageToChat(tafsirContent, 'system', currentChatID, true);
            } else if (tafsirData && tafsirData.error) {
                 addMessageToChat(`لم أتمكن من تحميل تفسير الآية ${ayahNumDisplay} من ${surahNameDisplay} حالياً. <small>(${tafsirData.message})</small>`, 'system', currentChatID, true, true);
            } else {
                addMessageToChat(`لم يتم العثور على ملف تفسير مخصص للآية ${ayahNumDisplay} من سورة ${surahNameDisplay}.`, 'system', currentChatID);
            }
            break;
        case 'play_single': // Renamed from 'repeat' if that was the intent for single ayah play
            addMessageToChat(`ميزة الاستماع للآية ${ayahNumDisplay} من ${surahNameDisplay} قيد التطوير.`, 'system', currentChatID);
            break;
        case 'share':
            const surahDataForShare = fetchedSurahsCache[surahIndex];
            if (surahDataForShare && surahDataForShare.verse[`verse_${ayahNumber}`]) {
                const textToShare = `﴿${surahDataForShare.verse[`verse_${ayahNumber}`]}﴾ [${surahNameDisplay}: ${ayahNumDisplay}] - من تطبيق قرآني معاي`;
                if (navigator.share) {
                    navigator.share({
                        title: `آية من القرآن الكريم: ${surahNameDisplay} ${ayahNumDisplay}`,
                        text: textToShare,
                    }).catch(error => {
                        console.log('خطأ في المشاركة (Web Share API):', error);
                        addMessageToChat(`فشلت عملية المشاركة. (${error.message})`, 'system', currentChatID, false, true);
                    });
                } else {
                    navigator.clipboard.writeText(textToShare)
                        .then(() => addMessageToChat('تم نسخ نص الآية إلى الحافظة لمشاركتها.', 'system', currentChatID))
                        .catch(err => addMessageToChat('فشل نسخ الآية إلى الحافظة.', 'system', currentChatID, true));
                }
            } else {
                addMessageToChat('لم أتمكن من العثور على نص الآية لمشاركتها (قد تحتاج لعرض السورة أولاً).', 'system', currentChatID, true);
            }
            break;
        case 'zen_this':
             if (surahIndex && ayahNumber) {
                fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            }
            break;
        default: console.warn("Unhandled tool action from static tools:", action);
    }
}


// --- (بقية الكود يبقى كما هو من الإصدار السابق النهائي) ---
// --- على سبيل المثال، الدوال مثل: ---
// initializeChatSession, setupEventListeners, setActiveSidebarLink,
// saveLastReadAyah, getLastReadAyah, startNewChat, loadChatHistory,
// saveMessageToHistory, updateRecentChatTimestampAndPreview, updateRecentChatsUI,
// updateChatTitle, handleUserInput, addMessageToChat, addTypingIndicator,
// handleMessageAreaClick (يستدعي handleAyahQuickToolAction),
// processQuranQuery (وفروعه),
// fetchAndDisplaySingleAyah (التي ستستدعي attachAyahToolListeners),
// displayFullSurah,
// setupZenModeNavigation, handleZenModeToggle, fetchAndDisplayZenAyah, displayInZenMode, navigateZenAyah,
// setupKhatmaUI, getKhatmaProgress, updateKhatmaProgressOnSurahView, updateKhatmaProgressDisplay
