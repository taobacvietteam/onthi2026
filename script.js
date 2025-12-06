import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser as firebaseDeleteUser } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, setDoc, getDoc, updateDoc, getDocs, arrayUnion, arrayRemove, limit, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 1. CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyDB2qnJUEKL0KSwEibU0t-mpBKyzuUt7SE",
    authDomain: "onthi-2026.firebaseapp.com",
    projectId: "onthi-2026",
    storageBucket: "onthi-2026.firebasestorage.app",
    messagingSenderId: "720604280248",
    appId: "1:720604280248:web:1e6a843eb0a0de42158b4d"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = 'onthi-2026';

// STATE
let currentUser = null;
let userProfile = null;
let currentChatType = 'global'; 
let currentChatTarget = null; // ID nhóm hoặc ID người chat
let player = null, videoTimer = null;
let gameInterval = null;
let meetingApi = null;
let currentAdminTab = 'users';

// INJECT YOUTUBE API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// --- HELPER FUNCTIONS ---
function toast(msg, type='info') {
    const t = document.createElement('div');
    t.className = `p-4 rounded-lg text-white shadow-xl fade-in flex items-center ${type==='error'?'bg-red-500':'bg-green-600'} text-sm max-w-[90vw]`;
    t.innerHTML = `<i class="fas ${type==='error'?'fa-exclamation-circle':'fa-check-circle'} mr-2"></i> ${msg}`;
    document.getElementById('toast-container').appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// --- AUTH ---
window.handleLogin = async () => {
    try {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        if(!email || !pass) return toast('Vui lòng nhập đầy đủ thông tin', 'error');
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) { toast('Lỗi đăng nhập: ' + e.message, 'error'); }
};

window.handleRegister = async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    if(!email || !pass) return toast('Vui lòng nhập đầy đủ thông tin', 'error');
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        // Tài khoản admin cứng
        const role = email === 'taobacvietteam@gmail.com' ? 'admin' : 'student';
        const profile = {
            uid: cred.user.uid,
            email, role, displayName: email.split('@')[0], 
            avatar: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=random`,
            isBlocked: false,
            createdAt: serverTimestamp()
        };
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', cred.user.uid, 'profile', 'info'), profile);
        await setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', cred.user.uid), profile);
        toast('Đăng ký thành công! Đang đăng nhập...', 'success');
    } catch(e) { toast(e.message, 'error'); }
};

window.handleLogout = () => signOut(auth).then(() => window.location.reload());

onAuthStateChanged(auth, async (user) => {
    if(user) {
        // Kiểm tra xem user còn tồn tại trong DB không (trường hợp bị Admin xóa)
        const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'info'));
        if(snap.exists()) {
            userProfile = snap.data();
            if(userProfile.isBlocked) { signOut(auth); alert('Tài khoản bị khóa!'); return; }
            
            currentUser = user;
            
            document.getElementById('auth-view').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden-section');
            updateProfileUI();
            
            // Phân quyền menu
            if(userProfile.role === 'admin') document.getElementById('admin-menu').classList.remove('hidden');
            if(userProfile.role === 'leader' || userProfile.role === 'admin') document.getElementById('btn-create-group').classList.remove('hidden');

            logActivity('login', 'Đăng nhập hệ thống');
            nav('dashboard');
        } else { 
            signOut(auth); 
            toast('Tài khoản không tồn tại hoặc đã bị xóa.', 'error'); 
        }
    } else {
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden-section');
    }
});

// --- NAVIGATION & UI ---
window.nav = (view) => {
    document.querySelectorAll('#content-container > div').forEach(d => d.classList.add('hidden-section'));
    const target = document.getElementById(`view-${view}`);
    if(target) target.classList.remove('hidden-section');
    
    if(view === 'groups') loadGroups();
    if(view === 'admin') loadAdminStats();
    if(view === 'games') loadLeaderboard();
};

function updateProfileUI() {
    document.getElementById('my-name-display').innerText = userProfile.displayName;
    document.getElementById('my-role-display').innerText = userProfile.role.toUpperCase();
    document.getElementById('my-avatar-img').src = userProfile.avatar;
}

window.openProfileModal = () => {
    document.getElementById('profile-name-input').value = userProfile.displayName;
    document.getElementById('profile-avatar-input').value = userProfile.avatar;
    document.getElementById('profile-preview-img').src = userProfile.avatar;
    document.getElementById('modal-profile').classList.remove('hidden');
};

window.saveProfile = async () => {
    const newName = document.getElementById('profile-name-input').value;
    const newAva = document.getElementById('profile-avatar-input').value;
    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'profile', 'info'), { displayName: newName, avatar: newAva });
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid), { displayName: newName, avatar: newAva });
    userProfile.displayName = newName; userProfile.avatar = newAva;
    updateProfileUI();
    document.getElementById('modal-profile').classList.add('hidden');
    toast('Cập nhật hồ sơ thành công!', 'success');
};

// --- GROUP SYSTEM ---
window.openCreateGroupModal = () => document.getElementById('modal-create-group').classList.remove('hidden');

window.createGroup = async () => {
    const name = document.getElementById('new-group-name').value;
    const pass = document.getElementById('new-group-pass').value;
    if(!name || !pass) return toast('Nhập đủ thông tin', 'error');
    
    await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups'), {
        name, pass, 
        leaderId: currentUser.uid, 
        leaderName: userProfile.displayName,
        members: [currentUser.uid], 
        createdAt: serverTimestamp()
    });
    document.getElementById('modal-create-group').classList.add('hidden');
    toast('Tạo nhóm thành công!', 'success');
    loadGroups();
};

window.loadGroups = () => {
    const container = document.getElementById('groups-list');
    onSnapshot(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups'), snap => {
        container.innerHTML = '';
        snap.forEach(d => {
            const g = d.data();
            const isMember = g.members.includes(currentUser.uid);
            container.innerHTML += `
                <div class="bg-white p-5 rounded-xl shadow border border-indigo-50 flex flex-col justify-between gap-3">
                    <div>
                        <h3 class="font-bold text-lg text-indigo-700">${g.name}</h3>
                        <p class="text-xs text-gray-500">Leader: ${g.leaderName} | ${g.members.length} mem</p>
                    </div>
                    <div class="flex gap-2 w-full">
                        ${isMember ? 
                            `<button onclick="startGroupMeeting('${d.id}')" class="flex-1 bg-green-500 text-white px-2 py-2 rounded text-sm font-bold"><i class="fas fa-video"></i> Họp</button>
                             <button onclick="openGroupChat('${d.id}', '${g.name}')" class="flex-1 bg-blue-500 text-white px-2 py-2 rounded text-sm font-bold"><i class="fas fa-comment"></i> Chat</button>`
                            : `<button onclick="joinGroup('${d.id}', '${g.pass}')" class="flex-1 bg-indigo-500 text-white px-2 py-2 rounded font-bold">Vào nhóm</button>`
                        }
                    </div>
                </div>`;
        });
    });
};

window.joinGroup = async (gid, truePass) => {
    const p = prompt("Nhập mật khẩu nhóm:");
    if(p === truePass) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid), { members: arrayUnion(currentUser.uid) });
        toast('Đã vào nhóm!', 'success');
    } else toast('Sai mật khẩu!', 'error');
};

// --- CHAT SYSTEM ---
window.switchChatTab = (type) => {
    currentChatType = type;
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-list').innerHTML = '';
    
    // Reset Header Buttons
    const headerTitle = document.getElementById('chat-title-display');
    headerTitle.innerHTML = ""; // Clear existing content

    if(type === 'global') {
        headerTitle.innerText = "Chat Chung";
        currentChatTarget = 'global';
        listenChat('global');
    } else if (type === 'private') {
        headerTitle.innerText = "Chọn người nhắn";
        loadUserListForChat();
    } else if (type === 'group') {
        headerTitle.innerText = "Chọn nhóm";
        loadMyGroupsForChat();
    }
};

// ... (loadUserListForChat, loadMyGroupsForChat functions remain similar) ...
function loadUserListForChat() {
    getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory')).then(snap => {
        const list = document.getElementById('chat-list');
        list.innerHTML = '';
        snap.forEach(d => {
            if(d.id === currentUser.uid) return;
            const u = d.data();
            const div = document.createElement('div');
            div.className = "p-2 hover:bg-white rounded cursor-pointer flex items-center transition";
            div.innerHTML = `<img src="${u.avatar}" class="w-8 h-8 rounded-full mr-2"><span class="text-sm font-bold truncate">${u.displayName}</span>`;
            div.onclick = () => {
                currentChatTarget = d.id;
                document.getElementById('chat-title-display').innerText = `${u.displayName}`;
                listenChat('private_sorted', getChatId(currentUser.uid, d.id));
            };
            list.appendChild(div);
        });
    });
}

function loadMyGroupsForChat() {
    getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups')).then(snap => {
         const list = document.getElementById('chat-list');
         list.innerHTML = '';
         snap.forEach(d => {
             const g = d.data();
             if(g.members.includes(currentUser.uid)) {
                 const div = document.createElement('div');
                 div.className = "p-2 hover:bg-white rounded cursor-pointer flex items-center transition";
                 div.innerHTML = `<div class="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center mr-2 text-indigo-600"><i class="fas fa-users"></i></div><span class="text-sm font-bold truncate">${g.name}</span>`;
                 div.onclick = () => openGroupChat(d.id, g.name);
                 list.appendChild(div);
             }
         });
    });
}
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

let chatUnsub;
function listenChat(collectionName, docId) {
    if(chatUnsub) chatUnsub();
    let collectionRef;
    
    if(collectionName === 'global') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global');
    else if (collectionName === 'private_sorted') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'chats', docId, 'messages');
    else if (collectionName === 'group') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups', docId, 'messages');

    if(collectionRef) {
        const q = query(collectionRef, orderBy('ts', 'asc'), limit(50));
        chatUnsub = onSnapshot(q, snap => {
            const div = document.getElementById('chat-messages');
            div.innerHTML = '';
            snap.forEach(d => renderMsg(d.data(), d.id, div, collectionName, docId));
            div.scrollTop = div.scrollHeight;
        });
    }
}

window.openGroupChat = (gid, gname) => {
    nav('chat');
    currentChatType = 'group';
    currentChatTarget = gid;
    
    // Header Chat có nút xem thành viên
    const header = document.getElementById('chat-title-display');
    header.innerHTML = `
        <div class="flex justify-between items-center w-full">
            <span>${gname}</span>
            <button onclick="openGroupMembers('${gid}')" class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200">
                <i class="fas fa-info-circle"></i> Thành viên
            </button>
        </div>
    `;
    listenChat('group', gid);
};

// --- CHAT: SEND & RENDER ---
window.sendChat = async () => {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    const img = document.getElementById('img-prev-src').src;
    const hasImg = !document.getElementById('image-preview').classList.contains('hidden');
    if(!txt && !hasImg) return;
    
    const msgData = { 
        text: txt, 
        img: hasImg ? img : null, 
        uid: currentUser.uid, 
        name: userProfile.displayName, 
        avatar: userProfile.avatar, 
        ts: serverTimestamp(),
        reactions: {} // New: Field cho reactions
    };
    input.value = ''; clearImage();

    try {
        if(currentChatType === 'global') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global'), msgData);
        else if (currentChatType === 'private') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chats', getChatId(currentUser.uid, currentChatTarget), 'messages'), msgData);
        else if (currentChatType === 'group') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups', currentChatTarget, 'messages'), msgData);
    } catch(e) { console.error(e); }
};

// UPDATE: Render message với Reaction
function renderMsg(msg, msgId, container, colName, docId) {
    const isMe = msg.uid === currentUser.uid;
    
    // Xử lý hiển thị reactions
    let reactionHtml = '';
    if (msg.reactions) {
        const counts = {};
        Object.values(msg.reactions).forEach(r => counts[r] = (counts[r] || 0) + 1);
        const reactionIcons = Object.keys(counts).map(k => `<span class="ml-1">${k} <span class="text-xs text-gray-500">${counts[k]}</span></span>`).join('');
        if(reactionIcons) {
            reactionHtml = `<div class="reaction-container absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'}">${reactionIcons}</div>`;
        }
    }

    const html = `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} group chat-bubble relative mb-4">
            ${!isMe ? `<img src="${msg.avatar}" class="w-8 h-8 rounded-full mr-2 self-end">` : ''}
            <div class="max-w-[80%] md:max-w-[70%] relative">
                ${!isMe ? `<p class="text-xs text-gray-400 ml-1 mb-1">${msg.name}</p>` : ''}
                <div class="p-3 rounded-2xl ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-gray-800 shadow-sm rounded-bl-none'} relative">
                    ${msg.img ? `<img src="${msg.img}" class="rounded-lg mb-2 max-w-full">` : ''}
                    ${msg.text ? `<p class="break-words text-sm md:text-base">${msg.text}</p>` : ''}
                    
                    <button class="reaction-trigger absolute -right-6 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-yellow-500 bg-white rounded-full p-1 shadow-sm border" onclick="toggleReactionPicker('${msgId}')">
                        <i class="far fa-smile"></i>
                    </button>
                    
                    <div id="picker-${msgId}" class="reaction-picker hidden">
                        ${['❤️','😂','😮','😢','👍'].map(emoji => 
                            `<span class="reaction-btn" onclick="addReaction('${colName}', '${docId}', '${msgId}', '${emoji}')">${emoji}</span>`
                        ).join('')}
                    </div>
                </div>
                ${reactionHtml}
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

// --- REACTION LOGIC ---
window.toggleReactionPicker = (msgId) => {
    // Ẩn tất cả các picker khác trước
    document.querySelectorAll('.reaction-picker').forEach(el => {
        if (el.id !== `picker-${msgId}`) el.classList.add('hidden');
    });
    const p = document.getElementById(`picker-${msgId}`);
    if(p) {
        p.classList.remove('hidden');
        p.style.display = 'flex'; // Force flex display
        // Tự động ẩn sau 3s nếu ko chọn
        setTimeout(() => p.classList.add('hidden'), 3000);
    }
};

window.addReaction = async (colName, docId, msgId, emoji) => {
    // Xác định đường dẫn collection
    let msgRef;
    if(colName === 'global') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global', msgId);
    else if(colName === 'private_sorted') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'chats', docId, 'messages', msgId);
    else if(colName === 'group') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', docId, 'messages', msgId);

    if(msgRef) {
        // Update field reactions.uid = emoji
        const updateField = {};
        updateField[`reactions.${currentUser.uid}`] = emoji;
        await updateDoc(msgRef, updateField);
        // Ẩn picker
        document.getElementById(`picker-${msgId}`).classList.add('hidden');
    }
};

// --- NEW: GROUP MEMBER MANAGEMENT (KICK, LEAVE) ---
window.openGroupMembers = async (gid) => {
    const modal = document.getElementById('modal-group-members');
    const listDiv = document.getElementById('group-members-list');
    const footerDiv = document.getElementById('group-actions-footer');
    
    listDiv.innerHTML = '<p class="text-center text-gray-500">Đang tải...</p>';
    modal.classList.remove('hidden');
    
    // Lấy thông tin nhóm
    const gSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid));
    if(!gSnap.exists()) return;
    const gData = gSnap.data();
    const isLeader = gData.leaderId === currentUser.uid;

    listDiv.innerHTML = '';
    footerDiv.innerHTML = '';

    // Nút Rời nhóm (nếu không phải Leader)
    if (!isLeader) {
        footerDiv.innerHTML = `<button onclick="leaveGroup('${gid}')" class="w-full bg-red-100 text-red-600 py-2 rounded font-bold hover:bg-red-200"><i class="fas fa-sign-out-alt"></i> Rời nhóm này</button>`;
    } else {
        footerDiv.innerHTML = `<p class="text-center text-xs text-gray-400">Trưởng nhóm không thể rời nhóm, hãy giải tán nhóm nếu muốn.</p>`;
    }

    // Load từng thành viên
    // Lưu ý: data nhóm lưu array 'members' là [uid1, uid2]. Cần fetch info từng user.
    // Để tối ưu, ở đây ta sẽ query users_directory với 'in' (giới hạn 10) hoặc fetch từng cái. 
    // Do Firestore limit, ta fetch từng cái loop cho đơn giản code demo.
    
    for (const memUid of gData.members) {
        const uSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', memUid));
        let uName = 'Unknown', uAva = '';
        if(uSnap.exists()) {
            uName = uSnap.data().displayName;
            uAva = uSnap.data().avatar;
        }

        const isMe = memUid === currentUser.uid;
        const isMemLeader = memUid === gData.leaderId;

        let actionBtn = '';
        // Nếu mình là Leader và người kia ko phải mình -> Cho phép Kick
        if (isLeader && !isMe) {
            actionBtn = `<button onclick="kickMember('${gid}', '${memUid}', '${uName}')" class="text-red-500 hover:bg-red-50 px-2 py-1 rounded text-xs font-bold border border-red-200">Kích</button>`;
        }

        listDiv.innerHTML += `
            <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded border-b">
                <div class="flex items-center">
                    <img src="${uAva}" class="w-8 h-8 rounded-full mr-2">
                    <div>
                        <p class="text-sm font-bold ${isMemLeader ? 'text-indigo-600':''}">${uName} ${isMe?'(Bạn)':''}</p>
                        ${isMemLeader ? '<span class="text-[10px] bg-indigo-100 text-indigo-600 px-1 rounded">Trưởng nhóm</span>' : ''}
                    </div>
                </div>
                <div>${actionBtn}</div>
            </div>
        `;
    }
};

window.leaveGroup = async (gid) => {
    if(!confirm("Bạn chắc chắn muốn rời nhóm này?")) return;
    try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid), {
            members: arrayRemove(currentUser.uid)
        });
        toast("Đã rời nhóm thành công.", "success");
        document.getElementById('modal-group-members').classList.add('hidden');
        nav('groups'); // Quay về danh sách nhóm
    } catch(e) { toast("Lỗi: " + e.message, 'error'); }
};

window.kickMember = async (gid, uid, name) => {
    if(!confirm(`Bạn muốn kích ${name} ra khỏi nhóm?`)) return;
    try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid), {
            members: arrayRemove(uid)
        });
        toast(`Đã kích ${name} khỏi nhóm.`, "success");
        // Reload modal list
        openGroupMembers(gid);
    } catch(e) { toast("Lỗi: " + e.message, 'error'); }
};

// --- MEETING & OTHER EXISTING LOGIC (Giữ nguyên) ---
window.startGroupMeeting = (groupId) => {
    nav('meeting');
    const domain = 'meet.jit.si';
    const options = {
        roomName: `OnThi2026_Group_${groupId}`,
        width: '100%', height: '100%',
        parentNode: document.querySelector('#meet-container'),
        userInfo: { displayName: userProfile.displayName },
        configOverwrite: { startWithAudioMuted: true },
        interfaceConfigOverwrite: { SHOW_JITSI_WATERMARK: false }
    };
    document.querySelector('#meet-container').innerHTML = '';
    meetingApi = new JitsiMeetExternalAPI(domain, options);
};
window.endMeeting = () => { if(meetingApi) meetingApi.dispose(); nav('groups'); };

// --- ADMIN FEATURES: PROMOTION & DELETE USER ---

window.switchAdminTab = (tab) => {
    currentAdminTab = tab;
    document.getElementById('admin-tab-users').classList.toggle('hidden-section', tab !== 'users');
    document.getElementById('admin-tab-logs').classList.toggle('hidden-section', tab !== 'logs');
    if(tab === 'users') loadAdminStats(); else loadActivityLogs();
};

window.loadAdminStats = () => {
     getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory')).then(snap => {
         const tbody = document.getElementById('admin-user-list'); tbody.innerHTML = '';
         snap.forEach(d => {
             const u = d.data();
             const isSelf = d.id === currentUser.uid;
             // Logic Buttons
             let roleBtn = '';
             if (u.role === 'student') roleBtn = `<button onclick="assignLeader('${d.id}')" class="text-xs bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200 mr-1">Thăng Leader</button>`;
             else if (u.role === 'leader') roleBtn = `<button onclick="demoteLeader('${d.id}')" class="text-xs bg-orange-100 text-orange-600 p-1 rounded hover:bg-orange-200 mr-1">Xuống Member</button>`;

             let deleteBtn = !isSelf ? `<button onclick="deleteUserSystem('${d.id}', '${u.displayName}')" class="text-xs bg-red-600 text-white p-1 rounded hover:bg-red-700"><i class="fas fa-trash"></i> Xóa TK</button>` : '';

             tbody.innerHTML += `
                <tr class="border-b">
                    <td class="p-3">
                        <div class="font-bold text-sm">${u.displayName}</div>
                        <div class="text-xs text-gray-500">${u.email}</div>
                    </td>
                    <td class="p-3 text-sm"><span class="px-2 py-1 rounded bg-gray-100">${u.role}</span></td>
                    <td class="p-3 text-sm">${u.isBlocked?'<span class="text-red-500">Khóa</span>':'<span class="text-green-500">Active</span>'}</td>
                    <td class="p-3 text-right">
                        ${!isSelf ? `
                            <button onclick="toggleBlockUser('${d.id}', ${u.isBlocked})" class="text-xs bg-gray-200 p-1 rounded mr-1">${u.isBlocked?'Mở':'Khóa'}</button>
                            ${roleBtn}
                            ${deleteBtn}
                        ` : '<span class="text-xs text-gray-400">Bạn</span>'}
                    </td>
                </tr>`;
         });
     });
};

// 1. Thăng chức Leader (Chỉ Admin)
window.assignLeader = async (uid) => {
    if(!confirm("Cấp quyền Nhóm Trưởng cho người này? Họ sẽ tạo được nhóm.")) return;
    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'), { role: 'leader' });
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { role: 'leader' });
    toast("Đã thăng chức thành công!", "success");
    loadAdminStats();
};
window.demoteLeader = async (uid) => {
    if(!confirm("Hủy quyền Nhóm Trưởng?")) return;
    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'), { role: 'student' });
    await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { role: 'student' });
    toast("Đã hủy quyền!", "success");
    loadAdminStats();
};

// 2. Xóa tài khoản khỏi hệ thống (Giả lập xóa - Soft Delete Data)
// Lưu ý: Không thể xóa Auth user từ client SDK nếu không có credential. 
// Cách xử lý: Xóa profile info -> Khi user đó đăng nhập lại sẽ ko tìm thấy profile -> Bị logout ngay.
window.deleteUserSystem = async (uid, name) => {
    const confirmStr = prompt(`Để xóa vĩnh viễn user "${name}", hãy nhập chữ "DELETE" vào ô dưới:`);
    if(confirmStr !== "DELETE") return toast("Hủy thao tác xóa.", "info");

    try {
        // 1. Xóa trong directory public
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid));
        // 2. Xóa profile gốc
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'));
        
        toast(`Đã xóa dữ liệu của ${name}. Họ sẽ không thể đăng nhập nữa.`, "success");
        loadAdminStats();
    } catch(e) {
        toast("Lỗi xóa user: " + e.message, "error");
    }
};

window.toggleBlockUser = async (uid, status) => {
    if(confirm("Đổi trạng thái khóa tài khoản này?")) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'), { isBlocked: !status });
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { isBlocked: !status });
        loadAdminStats();
    }
};

// ... (Các phần Game Logic & Subject Logic giữ nguyên từ code cũ) ...
window.handleImageSelect = (input) => { const file = input.files[0]; if(file) { const reader = new FileReader(); reader.onload = e => { document.getElementById('img-prev-src').src = e.target.result; document.getElementById('image-preview').classList.remove('hidden'); }; reader.readAsDataURL(file); } };
window.clearImage = () => { document.getElementById('image-preview').classList.add('hidden'); document.getElementById('img-prev-src').src = ''; };

// GAME LOGIC PLACEHOLDER (Copy lại phần game từ code trước vào đây để file chạy đủ)
let snakeDx = 0, snakeDy = 0; 
window.startGame = (gameType) => {
    const modal = document.getElementById('modal-game-play');
    const container = document.getElementById('game-canvas-container');
    const mobileControls = document.getElementById('snake-mobile-controls');
    modal.classList.remove('hidden');
    container.innerHTML = '';
    document.getElementById('game-score-play').innerText = "Score: 0";
    if (gameType === 'snake') { mobileControls.classList.remove('hidden'); mobileControls.classList.add('grid'); initSnakeGame(container); } 
    else { mobileControls.classList.add('hidden'); mobileControls.classList.remove('grid'); if(gameType === 'math') initMathGame(container); else if(gameType === 'memory') initMemoryGame(container); else if(gameType === 'clicker') initClickerGame(container); else if(gameType === 'typer') initTyperGame(container); }
};
window.closeGame = () => { if(gameInterval) clearInterval(gameInterval); document.getElementById('modal-game-play').classList.add('hidden'); };
window.handleMobileControl = (key) => { handleSnakeKey({ key: key }); };
function handleSnakeKey(e) { if(e.key==='ArrowUp' && snakeDy!==1) {snakeDx=0; snakeDy=-1} if(e.key==='ArrowDown' && snakeDy!==-1) {snakeDx=0; snakeDy=1} if(e.key==='ArrowLeft' && snakeDx!==1) {snakeDx=-1; snakeDy=0} if(e.key==='ArrowRight' && snakeDx!==-1) {snakeDx=1; snakeDy=0} }
function initSnakeGame(container) { const canvas = document.createElement('canvas'); canvas.width = 300; canvas.height = 300; container.appendChild(canvas); const ctx = canvas.getContext('2d'); let snake = [{x:10, y:10}]; let food = {x:15, y:15}; snakeDx=0; snakeDy=0; let score=0; document.addEventListener('keydown', handleSnakeKey); gameInterval = setInterval(() => { const head = {x: snake[0].x+snakeDx, y: snake[0].y+snakeDy}; snake.unshift(head); if(head.x === food.x && head.y === food.y) { score+=10; document.getElementById('game-score-play').innerText = `Score: ${score}`; food = {x: Math.floor(Math.random()*15), y: Math.floor(Math.random()*15)}; } else { snake.pop(); } ctx.fillStyle = '#222'; ctx.fillRect(0,0,300,300); ctx.fillStyle = 'red'; ctx.fillRect(food.x*20, food.y*20, 18, 18); ctx.fillStyle = 'lime'; snake.forEach(s => ctx.fillRect(s.x*20, s.y*20, 18, 18)); if(head.x<0||head.x>=15||head.y<0||head.y>=15) { clearInterval(gameInterval); document.removeEventListener('keydown', handleSnakeKey); alert(`Game Over! Score: ${score}`); closeGame(); } }, 150); }
function initMathGame(container) { container.innerHTML = `<div class="text-white text-center w-full"><div id="math-q" class="text-5xl font-bold mb-8">5 + 5 = ?</div><input type="number" id="math-ans" class="text-black p-3 rounded text-center text-2xl w-32 focus:outline-none" autofocus><button id="btn-math-submit" class="block w-full bg-blue-500 mt-6 p-3 rounded font-bold hover:bg-blue-600 transition">Trả lời</button><div id="math-timer" class="mt-4 text-red-400 font-mono text-xl">Time: 30s</div></div>`; let score = 0, timeLeft = 30, a, b, res; const nextQ = () => { a = Math.floor(Math.random()*20); b = Math.floor(Math.random()*20); res = a+b; document.getElementById('math-q').innerText = `${a} + ${b} = ?`; document.getElementById('math-ans').value = ''; document.getElementById('math-ans').focus(); }; const check = () => { if(parseInt(document.getElementById('math-ans').value) === res) { score+=10; document.getElementById('game-score-play').innerText = `Score: ${score}`; nextQ(); } }; document.getElementById('btn-math-submit').onclick = check; nextQ(); gameInterval = setInterval(() => { timeLeft--; document.getElementById('math-timer').innerText = `Time: ${timeLeft}s`; if(timeLeft<=0) { clearInterval(gameInterval); alert(`Hết giờ! Điểm: ${score}`); closeGame(); } }, 1000); }
function initMemoryGame(container) { const icons = ['🍎','🍌','🍒','🍇','🍉','🍊','🍍','🥝']; let cards = [...icons, ...icons].sort(() => 0.5 - Math.random()); let flipped = [], matched = 0, score = 0; container.innerHTML = `<div class="grid grid-cols-4 gap-2 w-full max-w-sm"></div>`; const grid = container.querySelector('div'); cards.forEach((icon) => { const card = document.createElement('div'); card.className = 'memory-card h-16 w-full relative'; card.innerHTML = `<div class="memory-card-inner w-full h-full"><div class="memory-front text-xl">${icon}</div><div class="memory-back"><i class="fas fa-question text-xl"></i></div></div>`; card.onclick = () => { if(card.classList.contains('flipped') || flipped.length >= 2) return; card.classList.add('flipped'); flipped.push({card, icon}); if(flipped.length === 2) { if(flipped[0].icon === flipped[1].icon) { matched++; score += 20; document.getElementById('game-score-play').innerText = `Score: ${score}`; flipped = []; if(matched === icons.length) { setTimeout(() => { alert(`Thắng! Điểm: ${score}`); closeGame(); }, 500); } } else { setTimeout(() => { flipped.forEach(f => f.card.classList.remove('flipped')); flipped = []; }, 800); } } }; grid.appendChild(card); }); }
function initClickerGame(container) { container.innerHTML = `<div class="text-center w-full"><button id="btn-clicker" class="bg-red-500 active:bg-red-700 text-white rounded-full w-40 h-40 text-2xl font-bold shadow-lg transform transition active:scale-95">CLICK ME</button><div id="clicker-timer" class="mt-8 text-yellow-400 text-xl font-mono">10.0s</div></div>`; let clicks = 0, time = 10.0, active = true; document.getElementById('btn-clicker').onclick = () => { if(active) { clicks++; document.getElementById('game-score-play').innerText = `Clicks: ${clicks}`; }}; gameInterval = setInterval(() => { time -= 0.1; document.getElementById('clicker-timer').innerText = time.toFixed(1) + 's'; if(time <= 0) { active = false; clearInterval(gameInterval); alert(`Hết giờ! Tốc độ: ${clicks} clicks.`); closeGame(); } }, 100); }
function initTyperGame(container) { const words = ['code', 'bug', 'fix', 'api', 'app', 'web', 'git', 'css', 'js', 'html']; let currentWord = '', score = 0, time = 30; container.innerHTML = `<div class="text-center w-full"><div id="typer-word" class="text-4xl font-bold text-green-400 mb-6 bg-gray-900 p-4 rounded select-none">START</div><input type="text" id="typer-input" class="w-full max-w-xs p-3 rounded text-center text-xl uppercase" placeholder="Gõ từ trên..." autocomplete="off"><div id="typer-timer" class="mt-4 text-gray-400">Time: 30s</div></div>`; const next = () => { currentWord = words[Math.floor(Math.random() * words.length)]; document.getElementById('typer-word').innerText = currentWord.toUpperCase(); document.getElementById('typer-input').value = ''; }; next(); const input = document.getElementById('typer-input'); input.focus(); input.oninput = () => { if(input.value.toLowerCase() === currentWord) { score++; document.getElementById('game-score-play').innerText = `Words: ${score}`; next(); } }; gameInterval = setInterval(() => { time--; document.getElementById('typer-timer').innerText = `Time: ${time}s`; if(time <= 0) { clearInterval(gameInterval); alert(`Hết giờ! ${score} từ.`); closeGame(); } }, 1000); }
window.logActivity = (action, details) => { if(!currentUser) return; addDoc(collection(db, 'artifacts', APP_ID, 'private', 'logs', 'activity'), { uid: currentUser.uid, name: userProfile.displayName, action, details, ts: serverTimestamp() }); };
window.loadActivityLogs = () => { onSnapshot(query(collection(db, 'artifacts', APP_ID, 'private', 'logs', 'activity'), orderBy('ts', 'desc'), limit(50)), snap => { const tbody = document.getElementById('admin-log-list'); tbody.innerHTML = ''; snap.forEach(d => { const l = d.data(); tbody.innerHTML += `<tr class="border-b text-xs"><td class="p-3">${l.ts ? new Date(l.ts.toDate()).toLocaleTimeString() : ''}</td><td class="p-3 font-bold">${l.name}</td><td class="p-3">${l.action}</td><td class="p-3">${l.details}</td></tr>`; }); }); };
// --- 1. DỮ LIỆU CÁC MÔN HỌC ---
const mockSubjectData = {
    'Toán': {
        videos: [
            { t: 'Hàm số lũy thừa', id: 'S3O8i_Q0dO8' },
            { t: 'Khảo sát hàm số', id: 'M7lc1UVf-VE' }
        ],
        docs: [
            
           { t: '50 đề thi minh họa', url: 'https://drive.google.com/file/d/1RyXb7KnEsX2uXgOQFq4Pn8WqxO0anGtA/preview' }
        ],
        exams: [
            { t: 'Đề thi thử THPTQG Toán - Đề 1', url: 'https://forms.google.com/example-quiz-1' },
            { t: 'Kiểm tra 15 phút Đại số', url: 'https://forms.google.com/example-quiz-2' }
        ]
    },
    'Lý': {
        videos: [
            { t: 'Dao động điều hòa', id: 'VIDEO_ID_LY_1' },
            { t: 'Con lắc lò xo', id: 'VIDEO_ID_LY_2' }
        ],
        docs: [{ t: 'Sơ đồ tư duy Vật Lý 12', url: '#' }],
        exams: [{ t: 'Đề ôn tập chương 1', url: '#' }]
    },
    'Hóa': {
        videos: [
     { t: 'Ester – lipit', id: '8nfiPbueiPI' },
    { t: 'Xà phòng chất giặt rửa', id: 'C3jy7oHOmM8' },
    { t: 'Glucose – Frutose', id: 'XLPKhuRhCBc' },
    { t: 'Saccharose – maltose', id: 'XelD6r5_n_c' },
    { t: 'Tinh bột – cellulose', id: 'FpEp0NWB4_M' },
    { t: 'Amine', id: 'tTfgqXaw8uQ' },
    { t: 'Amino acid – peptide', id: '7lW6UpVFJVE' },
    { t: 'Protein – enzyme', id: 'rzs_xCSiE0A' },
    { t: 'Polymer', id: 'EOyxtq2JKRU' },
    { t: 'Chữa đề ester lipit', id: 'HpY0KGAB89A' },
    { t: 'Vật liệu polymer', id: '0Y3sKdRggB8' },
    { t: 'Vật liệu polymer tiếp', id: 'Wte765CFfoo' },
    { t: 'Thế điện cực và nguồn điện hóa học', id: 'xlBNFQkz3_E' },
    { t: 'Điện phân', id: 'HqjDIseuzFY' },
    { t: 'Đặc điểm cấu tạo và liên kết kim loại', id: '3PKBx5Tl5J4' },
    { t: 'Chữa đề cacbohydrate', id: 'hrHdtdVTy70' },
    { t: 'Chữa đề hợp chất chứa nitrogen', id: 'aXnNOqx9HpU' },
    { t: 'Phương tách kim loại', id: 'fOElNpwr2HM' },
    { t: 'Hợp Kim - Sự ăn mòn kim loại', id: 'iolbKxBzQ3M' },
    { t: 'Nguyên tố kim loại nhóm IA', id: 'NhlH3X92rpg' },
    { t: 'Nguyên tố kim loại nhóm IIA', id: 'OLFo-k3T4XE' },
    { t: 'Kim loại chuyển tiếp', id: 'ITvyekImifI' },
    { t: 'Phức Chất', id: 'lMD8Pgy1VMo' },
    { t: 'Chữa đề thi minh họa', id: 'xQaFkr6Tffc' }
        ],
        docs: [
            { t: 'Bảng tuần hoàn chi tiết', url: '#' }
            
        ],
        exams: []
    },
    'Văn': {
        videos: [{ t: 'Vợ chồng A Phủ', id: 'VIDEO_ID_VAN' }],
        docs: [{ t: 'Văn mẫu phân tích Mị', url: '#' }],
        exams: [{ t: 'Đề nghị luận xã hội tháng 10', url: '#' }]
    },
    'Anh': {
        videos: [],
        docs: [
            { t: 'Chuyên Đề Từ Vựng Nâng Cao Tiếng Anh 12 Ôn Thi Tốt Nghiệp THPT', url: 'https://drive.google.com/file/d/14E8vDzX21I7T11vL8nwTWqpdeQZU0EYd/view?usp=sharing' }
          

                               ],
        exams: [{ t: 'Mock Test IELTS Reading', url: '#' }]
    },
    'default': {
        videos: [{ t: 'Bài học mẫu', id: 'CL13X-8o4h0?si' }],
        docs: [],
        exams: []
    }
};

// --- 2. HÀM MỞ MÔN HỌC ---
window.openSubject = (subj) => {
    const data = mockSubjectData[subj] || mockSubjectData['default'];
    document.getElementById('detail-subject-title').innerText = `Môn ${subj}`;

    // Render Video (Giữ nguyên)
    document.getElementById('subj-content-video').innerHTML = data.videos.map((v, i) => `
        <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center">
            <span class="font-bold text-sm">Bài ${i+1}: ${v.t}</span>
            <button onclick="playVideo('${v.id}')" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700">Học</button>
        </div>
    `).join('') || '<p class="text-gray-400 mt-2">Chưa có video.</p>';

    // Render Docs (Sửa: Dùng openEmbedModal)
    const docContainer = document.getElementById('subj-content-doc');
    if (docContainer) {
        docContainer.innerHTML = data.docs.map(d => `
            <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center border-l-4 border-blue-500">
                <span class="font-bold text-sm"><i class="fas fa-file-pdf text-blue-500"></i> ${d.t}</span>
                <button onclick="openEmbedModal('${d.url}', '${d.t}')" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
                    <i class="fas fa-eye"></i> Xem ngay
                </button>
            </div>
        `).join('') || '<p class="text-gray-400 mt-2">Chưa có tài liệu.</p>';
    }

    // Render Exams (Sửa: Dùng openEmbedModal)
    const examContainer = document.getElementById('subj-content-exam');
    if (examContainer) {
        examContainer.innerHTML = data.exams.map(e => `
            <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center border-l-4 border-green-500">
                <span class="font-bold text-sm"><i class="fas fa-pen-nib text-green-500"></i> ${e.t}</span>
                <button onclick="openEmbedModal('${e.url}', '${e.t}')" class="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
                    <i class="fas fa-edit"></i> Làm bài
                </button>
            </div>
        `).join('') || '<p class="text-gray-400 mt-2">Chưa có đề thi.</p>';
    }

    switchSubjectTab('video');
    nav('subject-detail');
};

// --- 3. HÀM XỬ LÝ MODAL EMBED (MỚI) ---
window.openEmbedModal = (url, title) => {
    // Cập nhật tiêu đề và link iframe
    document.getElementById('embed-title').innerText = title;
    document.getElementById('embed-frame').src = url;
    
    // Hiển thị modal
    document.getElementById('embed-modal').classList.remove('hidden');
};

window.closeEmbedModal = () => {
    document.getElementById('embed-modal').classList.add('hidden');
    // Xóa src để dừng tải/dừng video khi đóng
    document.getElementById('embed-frame').src = '';
};

// --- GIỮ LẠI CÁC HÀM CŨ ---
window.switchSubjectTab = (tab) => { /* Code cũ giữ nguyên */ 
    ['video', 'doc', 'exam'].forEach(t => { const btn = document.getElementById(`tab-subj-${t}`); const content = document.getElementById(`subj-content-${t}`); if(t===tab) { btn.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600'); btn.classList.remove('text-gray-500'); content.classList.remove('hidden-section'); } else { btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600'); btn.classList.add('text-gray-500'); content.classList.add('hidden-section'); } });
};
window.playVideo = (vidId) => { /* Code cũ giữ nguyên */ 
    document.getElementById('video-modal').classList.remove('hidden'); if(player) player.loadVideoById(vidId); else player = new YT.Player('youtube-player', { height: '100%', width: '100%', videoId: vidId, playerVars: { 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0 }, events: { 'onStateChange': onPlayerStateChange } }); 
};
function onPlayerStateChange(event) { if (event.data == YT.PlayerState.PLAYING) videoTimer = setInterval(strictVideoLoop, 1000); else clearInterval(videoTimer); }
function strictVideoLoop() { if(!player || !player.getDuration) return; const cur = player.getCurrentTime(), dur = player.getDuration(), per = (cur/dur)*100; document.getElementById('video-bar').style.width = per + '%'; document.getElementById('video-percent').innerText = Math.round(per) + '%'; const m = Math.floor(cur/60), s = Math.floor(cur%60); document.getElementById('video-time').innerText = `${m}:${s<10?'0'+s:s}`; if (player.isMuted()) player.unMute(); }
window.closeVideoModal = () => { document.getElementById('video-modal').classList.add('hidden'); if(player && player.stopVideo) player.stopVideo(); clearInterval(videoTimer); };

