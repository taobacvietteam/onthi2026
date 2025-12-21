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
let currentChatTarget = null;
let player = null, videoTimer = null;
let gameInterval = null;
let meetingApi = null;
let currentAdminTab = 'users';
let currentViewingGroupId = null; // Biến quan trọng cho quản lý nhóm

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
    const emailEl = document.getElementById('auth-email');
    const passEl = document.getElementById('auth-pass');
    // Cần thêm ID cho nút đăng ký trong HTML để code này hoạt động
    const btn = document.getElementById('btn-register-submit'); 

    const email = emailEl.value;
    const pass = passEl.value;

    if(!email || !pass) return toast('Vui lòng nhập đầy đủ thông tin', 'error');

    // 1. Khóa nút bấm và đổi text để người dùng biết đang chạy
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        // 2. Tạo User Authentication
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        
        const role = email === 'taobacvietteam@gmail.com' ? 'admin' : 'student';
        
        // 3. Tạo dữ liệu Profile (Thêm totalScore = 0 để hiện BXH)
        const profile = {
            uid: cred.user.uid,
            email, 
            role, 
            displayName: email.split('@')[0], 
            avatar: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=random`,
            isBlocked: false,
            createdAt: serverTimestamp(),
            totalScore: 0 // QUAN TRỌNG: Khởi tạo điểm bằng 0
        };

        // 4. Lưu song song vào 2 nơi (nhanh gấp đôi cách cũ)
        await Promise.all([
            setDoc(doc(db, 'artifacts', APP_ID, 'users', cred.user.uid, 'profile', 'info'), profile),
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', cred.user.uid), profile)
        ]);

        toast('Đăng ký thành công! Đang chuyển hướng...', 'success');
        // Không cần làm gì thêm, onAuthStateChanged sẽ tự động bắt sự kiện và chuyển trang

    } catch(e) {
        console.error(e);
        // Việt hóa lỗi phổ biến
        if(e.code === 'auth/email-already-in-use') {
            toast('Email này đã được sử dụng!', 'error');
        } else if (e.code === 'auth/weak-password') {
            toast('Mật khẩu quá yếu (cần > 6 ký tự)', 'error');
        } else {
            toast('Lỗi: ' + e.message, 'error');
        }
    } finally {
        // 5. Mở lại nút bấm dù thành công hay thất bại
        if(btn) {
            btn.disabled = false;
            btn.innerText = 'Đăng ký';
        }
    }
};

window.handleLogout = () => signOut(auth).then(() => window.location.reload());

onAuthStateChanged(auth, async (user) => {
    if(user) {
        const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'info'));
        if(snap.exists()) {
            userProfile = snap.data();
            if(userProfile.isBlocked) { signOut(auth); alert('Tài khoản bị khóa!'); return; }
            
            currentUser = user;
            
            document.getElementById('auth-view').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden-section');
            updateProfileUI();
            
            if(userProfile.role === 'admin') document.getElementById('admin-menu').classList.remove('hidden');
            if(userProfile.role === 'leader' || userProfile.role === 'admin') document.getElementById('btn-create-group').classList.remove('hidden');

            // Hook nav thật vào window để HTML gọi
            window.handleNavReal = (viewId) => {
                document.querySelectorAll('#content-container > div').forEach(d => d.classList.add('hidden-section'));
                const target = document.getElementById(`view-${viewId}`);
                if(target) target.classList.remove('hidden-section');
                
                if(viewId === 'groups') loadGroups();
                if(viewId === 'admin') loadAdminStats();
                if(viewId === 'games') loadLeaderboard();
            };

            logActivity('login', 'Đăng nhập hệ thống');
            window.handleNavReal('dashboard');
        } else { 
            signOut(auth); 
            toast('Tài khoản không tồn tại hoặc đã bị xóa.', 'error'); 
        }
    } else {
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden-section');
    }
});

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

// --- GROUP SYSTEM (CORE) ---
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
        documents: [], // Khởi tạo mảng tài liệu rỗng
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
                <div onclick="${isMember ? `openGroupDetail('${d.id}')` : ''}" class="bg-white p-5 rounded-xl shadow border border-indigo-50 flex flex-col justify-between gap-3 cursor-pointer hover:shadow-lg transition">
                    <div>
                        <h3 class="font-bold text-lg text-indigo-700">${g.name}</h3>
                        <p class="text-xs text-gray-500">Leader: ${g.leaderName} | ${g.members.length} mem</p>
                    </div>
                    <div class="flex gap-2 w-full" onclick="event.stopPropagation()">
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
    const headerTitle = document.getElementById('chat-title-display');
    headerTitle.innerHTML = "";

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
    window.handleNavReal('chat');
    currentChatType = 'group';
    currentChatTarget = gid;
    const header = document.getElementById('chat-title-display');
    header.innerHTML = `
        <div class="flex justify-between items-center w-full">
            <span>${gname}</span>
            <button onclick="openGroupDetail('${gid}')" class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200">
                <i class="fas fa-info-circle"></i> Chi tiết
            </button>
        </div>
    `;
    listenChat('group', gid);
};

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
        reactions: {}
    };
    input.value = ''; clearImage();

    try {
        if(currentChatType === 'global') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global'), msgData);
        else if (currentChatType === 'private') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chats', getChatId(currentUser.uid, currentChatTarget), 'messages'), msgData);
        else if (currentChatType === 'group') await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups', currentChatTarget, 'messages'), msgData);
    } catch(e) { console.error(e); }
};

function renderMsg(msg, msgId, container, colName, docId) {
    const isMe = msg.uid === currentUser.uid;
    let reactionHtml = '';
    if (msg.reactions) {
        const counts = {};
        Object.values(msg.reactions).forEach(r => counts[r] = (counts[r] || 0) + 1);
        const reactionIcons = Object.keys(counts).map(k => `<span class="ml-1">${k} <span class="text-xs text-gray-500">${counts[k]}</span></span>`).join('');
        if(reactionIcons) reactionHtml = `<div class="reaction-container absolute -bottom-3 ${isMe ? 'right-0' : 'left-0'}">${reactionIcons}</div>`;
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

window.toggleReactionPicker = (msgId) => {
    document.querySelectorAll('.reaction-picker').forEach(el => { if (el.id !== `picker-${msgId}`) el.classList.add('hidden'); });
    const p = document.getElementById(`picker-${msgId}`);
    if(p) { p.classList.remove('hidden'); p.style.display = 'flex'; setTimeout(() => p.classList.add('hidden'), 3000); }
};

window.addReaction = async (colName, docId, msgId, emoji) => {
    let msgRef;
    if(colName === 'global') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global', msgId);
    else if(colName === 'private_sorted') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'chats', docId, 'messages', msgId);
    else if(colName === 'group') msgRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', docId, 'messages', msgId);

    if(msgRef) {
        const updateField = {};
        updateField[`reactions.${currentUser.uid}`] = emoji;
        await updateDoc(msgRef, updateField);
        document.getElementById(`picker-${msgId}`).classList.add('hidden');
    }
};

// --- MEETING ---
window.startGroupMeeting = (groupId) => {
    window.handleNavReal('meeting');
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
window.endMeeting = () => { if(meetingApi) meetingApi.dispose(); window.handleNavReal('groups'); };

// --- ADMIN FEATURES ---
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
                            ${roleBtn} ${deleteBtn}
                        ` : '<span class="text-xs text-gray-400">Bạn</span>'}
                    </td>
                </tr>`;
         });
     });
};

window.assignLeader = async (uid) => {
    if(!confirm("Cấp quyền Nhóm Trưởng?")) return;
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
window.deleteUserSystem = async (uid, name) => {
    if(prompt(`Nhập 'DELETE' để xóa "${name}":`) !== "DELETE") return;
    try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid));
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'));
        toast(`Đã xóa dữ liệu của ${name}.`, "success");
        loadAdminStats();
    } catch(e) { toast("Lỗi xóa user: " + e.message, "error"); }
};
window.toggleBlockUser = async (uid, status) => {
    if(confirm("Đổi trạng thái khóa?")) {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'), { isBlocked: !status });
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { isBlocked: !status });
        loadAdminStats();
    }
};

window.handleImageSelect = (input) => { const file = input.files[0]; if(file) { const reader = new FileReader(); reader.onload = e => { document.getElementById('img-prev-src').src = e.target.result; document.getElementById('image-preview').classList.remove('hidden'); }; reader.readAsDataURL(file); } };
window.clearImage = () => { document.getElementById('image-preview').classList.add('hidden'); document.getElementById('img-prev-src').src = ''; };

// GAME LOGIC
// ==========================================
// --- GAME LOGIC SYSTEM (REPLACED) ---
// ==========================================

// 1. Biến quản lý vòng lặp chung (Chỉ khai báo 1 lần duy nhất ở đây)
let activeGameInterval = null;

// 2. Hàm dọn dẹp game cũ (Chỉ khai báo 1 lần duy nhất ở đây)
function clearActiveGame() {
    if (activeGameInterval) clearInterval(activeGameInterval);
    document.onkeydown = null; // Xóa sự kiện bàn phím
}

// 3. Hàm Bắt đầu Game (Đã sửa để gọi Dodge Game thay vì Snake)
window.startGame = (gameType) => {
    const modal = document.getElementById('modal-game-play');
    const container = document.getElementById('game-canvas-container');
    const mobileControls = document.getElementById('snake-mobile-controls'); // ID cũ trong HTML
    
    // Hiển thị Modal
    modal.classList.remove('hidden');
    container.innerHTML = '';
    document.getElementById('game-score-play').innerText = "Score: 0";
    
    // Ẩn bộ điều khiển cũ ngoài HTML (vì Game mới tự vẽ nút rồi)
    if(mobileControls) {
        mobileControls.classList.add('hidden');
        mobileControls.classList.remove('grid');
    }

    clearActiveGame(); // Dọn dẹp game cũ trước khi chạy

    // Điều hướng chọn game
    if (gameType === 'snake') { 
        // Vẫn giữ ID là 'snake' để không phải sửa HTML, nhưng chạy hàm Dodge
        initDodgeGame(container); 
    } 
    else if (gameType === 'math') initMathGame(container); 
    else if (gameType === 'memory') initMemoryGame(container); 
    else if (gameType === 'clicker') initClickerGame(container); 
    else if (gameType === 'typer') initTyperGame(container);
};

// 4. Hàm Đóng Game
window.closeGame = () => {
    clearActiveGame(); // Dừng mọi thứ
    document.getElementById('modal-game-play').classList.add('hidden');
    // Ẩn các nút điều khiển nếu có
    const mobileControls = document.getElementById('snake-mobile-controls');
    if(mobileControls) mobileControls.classList.add('hidden');
};

// 5. Hàm xử lý nút bấm cũ (Để trống để không báo lỗi)
window.handleMobileControl = (key) => { return; };

// ==========================================
// --- GAME 1: DODGE (NÉ THIÊN THẠCH) ---
// ==========================================
function initDodgeGame(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center w-full select-none">
            <div class="mb-2 flex justify-between w-full max-w-[300px] text-white font-bold text-sm">
                <span>HP: <span id="dodge-hp" class="text-red-500 text-lg">3</span></span>
                <span>Level: <span id="dodge-level" class="text-yellow-400 text-lg">1</span></span>
            </div>
            <canvas id="dodge-canvas" width="300" height="400" class="bg-gray-900 border-2 border-gray-700 rounded shadow-lg touch-none" style="max-width: 100%;"></canvas>
            
            <div class="mt-4 grid grid-cols-2 gap-4 w-full max-w-[300px]">
                <button id="btn-dodge-left" class="bg-indigo-600 active:bg-indigo-500 text-white p-4 rounded-xl shadow-lg font-bold text-xl transition-transform active:scale-95 touch-manipulation">
                    <i class="fas fa-arrow-left"></i> TRÁI
                </button>
                <button id="btn-dodge-right" class="bg-indigo-600 active:bg-indigo-500 text-white p-4 rounded-xl shadow-lg font-bold text-xl transition-transform active:scale-95 touch-manipulation">
                    PHẢI <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <p class="text-gray-400 text-xs mt-3 text-center">💡 Mẹo: Né khối ĐỎ, ăn khối VÀNG!</p>
        </div>
    `;

    const canvas = document.getElementById('dodge-canvas');
    const ctx = canvas.getContext('2d');

    let player = { x: 130, y: 340, w: 40, h: 40, color: '#3b82f6' };
    let enemies = [];
    let score = 0;
    let hp = 3;
    let frameCount = 0;
    let isGameOver = false;

    const moveLeft = () => { if (player.x > 0 && !isGameOver) player.x -= 50; };
    const moveRight = () => { if (player.x < 260 && !isGameOver) player.x += 50; };

    document.onkeydown = (e) => {
        if (e.key === 'ArrowLeft') moveLeft();
        if (e.key === 'ArrowRight') moveRight();
    };

    document.getElementById('btn-dodge-left').onclick = (e) => { e.preventDefault(); moveLeft(); };
    document.getElementById('btn-dodge-right').onclick = (e) => { e.preventDefault(); moveRight(); };

    activeGameInterval = setInterval(() => {
        if (isGameOver) return;
        frameCount++;

        let spawnRate = Math.max(15, 40 - Math.floor(score / 100) * 2); 
        if (frameCount % spawnRate === 0) {
            let isBonus = Math.random() < 0.15;
            enemies.push({
                x: Math.floor(Math.random() * 6) * 50 + 5, 
                y: -40, w: 40, h: 40,
                type: isBonus ? 'bonus' : 'danger',
                color: isBonus ? '#fbbf24' : '#ef4444'
            });
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = player.color;
        ctx.shadowBlur = 15; ctx.shadowColor = player.color;
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.shadowBlur = 0;

        for (let i = 0; i < enemies.length; i++) {
            let e = enemies[i];
            e.y += 4 + Math.floor(score / 200);

            ctx.fillStyle = e.color;
            ctx.fillRect(e.x, e.y, e.w, e.h);

            if (player.x < e.x + e.w && player.x + player.w > e.x &&
                player.y < e.y + e.h && player.y + player.h > e.y) {
                
                if (e.type === 'danger') {
                    hp--;
                    document.getElementById('dodge-hp').innerText = hp;
                    canvas.classList.add('opacity-50'); setTimeout(()=>canvas.classList.remove('opacity-50'), 100);
                    if (hp <= 0) endGame();
                } else {
                    score += 50;
                }
                enemies.splice(i, 1); i--; continue;
            }

            if (e.y > canvas.height) {
                if (e.type === 'danger') score += 10;
                enemies.splice(i, 1); i--;
            }
        }

        document.getElementById('game-score-play').innerText = `Score: ${score}`;
        document.getElementById('dodge-level').innerText = 1 + Math.floor(score / 300);

    }, 30);

    function endGame() {
        isGameOver = true;
        clearInterval(activeGameInterval);
        document.onkeydown = null;
        // GỌI HÀM LƯU ĐIỂM
        if(typeof handleGameOver === 'function') handleGameOver(score);
        else { alert(`Game Over! Score: ${score}`); closeGame(); }
    }
}

// ==========================================
// --- GAME 2: MATH (TOÁN HỌC) ---
// ==========================================
function initMathGame(container) {
    clearActiveGame();
    container.innerHTML = `<div class="text-white text-center w-full"><div id="math-q" class="text-5xl font-bold mb-8">5 + 5 = ?</div><input type="number" id="math-ans" class="text-black p-3 rounded text-center text-2xl w-32 focus:outline-none" autofocus><button id="btn-math-submit" class="block w-full bg-blue-500 mt-6 p-3 rounded font-bold hover:bg-blue-600 transition">Trả lời</button><div id="math-timer" class="mt-4 text-red-400 font-mono text-xl">Time: 30s</div></div>`;
    
    let score = 0, timeLeft = 30, a, b, res;
    
    const nextQ = () => {
        a = Math.floor(Math.random() * 20);
        b = Math.floor(Math.random() * 20);
        res = a + b;
        document.getElementById('math-q').innerText = `${a} + ${b} = ?`;
        document.getElementById('math-ans').value = '';
        document.getElementById('math-ans').focus();
    };
    
    const check = () => {
        if (parseInt(document.getElementById('math-ans').value) === res) {
            score += 10;
            document.getElementById('game-score-play').innerText = `Score: ${score}`;
            nextQ();
        }
    };
    
    document.getElementById('btn-math-submit').onclick = check;
    document.getElementById('math-ans').onkeydown = (e) => { if(e.key === 'Enter') check(); };

    nextQ();
    
    activeGameInterval = setInterval(() => {
        timeLeft--;
        document.getElementById('math-timer').innerText = `Time: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(activeGameInterval);
            // GỌI HÀM LƯU ĐIỂM
            if(typeof handleGameOver === 'function') handleGameOver(score);
            else { alert(`Hết giờ! Điểm: ${score}`); closeGame(); }
        }
    }, 1000);
}

// ==========================================
// --- GAME 3: MEMORY (LẬT HÌNH) ---
// ==========================================
function initMemoryGame(container) {
    clearActiveGame();
    const icons = ['🍎', '🍌', '🍒', '🍇', '🍉', '🍊', '🍍', '🥝'];
    let cards = [...icons, ...icons].sort(() => 0.5 - Math.random());
    let flipped = [], matched = 0, score = 0;
    
    container.innerHTML = `<div class="grid grid-cols-4 gap-2 w-full max-w-sm mx-auto"></div>`;
    const grid = container.querySelector('div');
    
    cards.forEach((icon) => {
        const card = document.createElement('div');
        card.className = 'h-16 w-full bg-blue-200 rounded cursor-pointer flex justify-center items-center text-3xl select-none transition-all';
        card.innerHTML = `<span class="opacity-0">${icon}</span>`;
        
        card.onclick = () => {
            if (card.classList.contains('bg-white') || flipped.length >= 2) return;
            
            card.classList.remove('bg-blue-200');
            card.classList.add('bg-white', 'border-2', 'border-blue-500');
            card.querySelector('span').classList.remove('opacity-0');
            
            flipped.push({ card, icon });
            
            if (flipped.length === 2) {
                if (flipped[0].icon === flipped[1].icon) {
                    matched++;
                    score += 20;
                    document.getElementById('game-score-play').innerText = `Score: ${score}`;
                    flipped = [];
                    if (matched === icons.length) {
                        setTimeout(() => {
                            // GỌI HÀM LƯU ĐIỂM
                            if(typeof handleGameOver === 'function') handleGameOver(score);
                            else { alert(`Thắng! Điểm: ${score}`); closeGame(); }
                        }, 500);
                    }
                } else {
                    setTimeout(() => {
                        flipped.forEach(f => {
                            f.card.classList.add('bg-blue-200');
                            f.card.classList.remove('bg-white', 'border-2', 'border-blue-500');
                            f.card.querySelector('span').classList.add('opacity-0');
                        });
                        flipped = [];
                    }, 800);
                }
            }
        };
        grid.appendChild(card);
    });
}

// ==========================================
// --- GAME 4: CLICKER (BẤM NHANH) ---
// ==========================================
function initClickerGame(container) {
    clearActiveGame();
    container.innerHTML = `<div class="text-center w-full"><button id="btn-clicker" class="bg-red-500 active:bg-red-700 text-white rounded-full w-40 h-40 text-2xl font-bold shadow-lg transform transition active:scale-95 touch-manipulation">CLICK ME</button><div id="clicker-timer" class="mt-8 text-yellow-400 text-xl font-mono">10.0s</div></div>`;
    
    let clicks = 0, time = 10.0, active = true;
    
    document.getElementById('btn-clicker').onclick = () => {
        if (active) {
            clicks++;
            document.getElementById('game-score-play').innerText = `Clicks: ${clicks}`;
        }
    };
    
    activeGameInterval = setInterval(() => {
        time -= 0.1;
        document.getElementById('clicker-timer').innerText = Math.max(0, time).toFixed(1) + 's';
        if (time <= 0) {
            active = false;
            clearInterval(activeGameInterval);
            // GỌI HÀM LƯU ĐIỂM
            if(typeof handleGameOver === 'function') handleGameOver(clicks); // Lưu số clicks làm điểm
            else { alert(`Hết giờ! ${clicks} clicks.`); closeGame(); }
        }
    }, 100);
}

// ==========================================
// --- GAME 5: TYPER (GÕ PHÍM) ---
// ==========================================
function initTyperGame(container) {
    clearActiveGame();
    const words = ['code', 'bug', 'fix', 'api', 'app', 'web', 'git', 'css', 'js', 'html', 'react', 'node', 'java'];
    let currentWord = '', score = 0, time = 30;
    
    container.innerHTML = `<div class="text-center w-full"><div id="typer-word" class="text-4xl font-bold text-green-400 mb-6 bg-gray-900 p-4 rounded select-none">START</div><input type="text" id="typer-input" class="w-full max-w-xs p-3 rounded text-center text-xl uppercase" placeholder="Gõ từ trên..." autocomplete="off"><div id="typer-timer" class="mt-4 text-gray-400">Time: 30s</div></div>`;
    
    const next = () => {
        currentWord = words[Math.floor(Math.random() * words.length)];
        document.getElementById('typer-word').innerText = currentWord.toUpperCase();
        document.getElementById('typer-input').value = '';
    };
    next();
    
    const input = document.getElementById('typer-input');
    input.focus();
    input.oninput = () => {
        if (input.value.toLowerCase() === currentWord) {
            score++;
            document.getElementById('game-score-play').innerText = `Words: ${score}`;
            next();
        }
    };
    
    activeGameInterval = setInterval(() => {
        time--;
        document.getElementById('typer-timer').innerText = `Time: ${time}s`;
        if (time <= 0) {
            clearInterval(activeGameInterval);
            // GỌI HÀM LƯU ĐIỂM
            if(typeof handleGameOver === 'function') handleGameOver(score);
            else { alert(`Hết giờ! ${score} từ.`); closeGame(); }
        }
    }, 1000);
}

window.loadActivityLogs = () => {
    onSnapshot(query(collection(db, 'artifacts', APP_ID, 'private', 'logs', 'activity'), orderBy('ts', 'desc'), limit(50)), snap => {
        const tbody = document.getElementById('admin-log-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        snap.forEach(d => {
            const l = d.data();
            tbody.innerHTML += `
                <tr class="border-b text-xs hover:bg-gray-100 transition">
                    <td class="p-3 text-gray-500">${l.ts ? new Date(l.ts.toDate()).toLocaleTimeString() : ''}</td>
                    <td class="p-3 font-bold text-gray-700">${l.name}</td>
                    <td class="p-3 text-blue-600 font-medium">${l.action}</td>
                    <td class="p-3 text-gray-600">${l.details}</td>
                </tr>`;
        });
    });
};
const mockSubjectData = {
    'Toán': {
        videos: [
    { t: 'Ứng dụng đạo hàm toán thực tế P1', id: 'j4OK3ihNk_8' },
    { t: 'Ứng dụng đạo hàm toán thực tế P2', id: 'Mm8VmEU_ZnM' },
    { t: 'Ứng dụng đạo hàm toán thực tế P3', id: 'epoJkAC81LA' },
    { t: 'Ứng dụng đạo hàm toán thực tế P4', id: '2ZXd09Csx4M' },
    { t: 'Ứng dụng đạo hàm toán thực tế P5', id: 'KVRiMu1ckPQ' },
    { t: 'Ứng dụng đạo hàm toán thực tế P6', id: 'KrrJcuVwEH0' },
    { t: 'Ứng dụng vecto thực tế', id: 'IrIQQSiTX7c' },
    { t: 'Ứng dụng tích phân thực tế P1', id: '1T9G9Ihinq8' },
    { t: 'Ứng dụng tích phân thực tế P2', id: 'p1-5Ok7q2qk' },
    { t: 'Ứng dụng tích phân thực tế P3', id: 'Lrp2ErdzOsY' },
    { t: 'Hình không gian thực tế P1', id: 'OlVXRRajh28' }, // Đã xếp lại thứ tự P1
    { t: 'Hình không gian thực tế P2', id: 'G9SRQVUrvxY' },
    { t: 'Hình không gian thực tế P3', id: 'WYYvgmtzM00' },

    // --- CHUYÊN ĐỀ 2: HÀM SỐ & KHẢO SÁT HÀM SỐ ---
    { t: 'Tính đơn điệu của hàm số', id: 'zsxktJWNxVI' },
    { t: 'Cực trị của hàm số', id: 'BbFj2KgZy6Q' },
    { t: 'Giá trị lớn nhất – Giá trị nhỏ nhất', id: 'WsMJEaCQsoA' },
    { t: 'Đường tiệm cận', id: 'o6g5ZpOczLc' },
    { t: 'Khảo sát và vẽ đồ thị', id: '990wEB5yo2k' },
    { t: 'Đơn điệu chứa tham số', id: 'g7InuFPi7Yo' },
    { t: 'Cực trị chứa tham số', id: 'hSe9VbM95o4' },
    { t: 'Tiệm cận chứa tham số', id: 'jqKJAmWblEc' },

    // --- CHUYÊN ĐỀ 3: NGUYÊN HÀM & TÍCH PHÂN (LÝ THUYẾT & PHƯƠNG PHÁP) ---
    { t: 'Nguyên hàm cơ bản và công thức nguyên hàm', id: 'j615s9znk4U' },
    { t: 'Nguyên hàm thường gặp', id: '7urfQ8s20oY' },
    { t: 'Các phương pháp tìm nguyên hàm', id: 'DGD40tAWAjk' },
    { t: 'Phương pháp biến đổi nguyên hàm P1', id: 'FvzxF99LvR0' },
    { t: 'Phương pháp biến đổi nguyên hàm P2', id: 'bpTkSKB21FQ' },
    { t: 'Phương pháp biến đổi nguyên hàm P3', id: 'pruobOzUaZE' },
    { t: 'Nguyên hàm từng phần P1', id: '4_OACc2R8J8' },
    { t: 'Nguyên hàm từng phần P2', id: 'S04zczlyd04' }, // Đã gom P2 về gần P1
    { t: 'Nguyên hàm số vô tỉ', id: 'grvjJCPElw4' },
    { t: 'Nguyên hàm vi phân', id: 'UqjcQFls4jE' },
    { t: 'Nguyên hàm đa thức', id: 'lH2tCeCbWdI' },
    { t: 'Nguyên hàm phân thức', id: '-GEbsBlsm-c' },
    { t: 'Nguyên hàm số mũ', id: 'r4Rf8a5SE2U' },
    { t: 'Phương trình vi phân (NH-TP)', id: 'PY5J_Y3fjjM' },
    { t: 'Vận dụng cao nguyên hàm', id: 'orbwtuj_K1w' },
    { t: 'Nguyên hàm full dạng', id: 'JXtw8WtdkEg' },
    
    // --- CHUYÊN ĐỀ 4: TÍCH PHÂN & ỨNG DỤNG ---
    { t: 'Tích phân', id: 'cNDQkKzfsfw' },
    { t: 'Ứng dụng tích phân P1', id: 'U70aHEdl8sY' },
    { t: 'Ứng dụng tích phân P2', id: 'X9GI7LpnWwA' },
    { t: 'Ứng dụng tích phân P3', id: 'wIfTTYnWsCg' },
    { t: 'Ứng dụng tích phân P4', id: 'FfNGMIab_VA' },
    { t: 'Ứng dụng hình học của tích phân', id: '4DE9Cz-e2mo' },
    { t: 'Tích phân hàm ẩn', id: 'jRdqkSb88vE' },
    { t: 'Tích phân hàm trị tuyệt đối', id: 'MIwukaeWuVs' },
    { t: 'Diện tích đường cong đặc biệt (NH-TP)', id: 'xMxrawY-eBA' },
    { t: 'Vận dụng cao tích phân', id: 'hMkcuuCfTIw' },
    { t: 'Phương pháp chéo hóa (NH-TP)', id: 'SuerH0sP30w' },
    { t: 'Giải toán maxmin (NH-TP)', id: 'tL4tkwqo3gc' },

    // --- CHUYÊN ĐỀ 5: HÌNH HỌC OXYZ (VECTO & TỌA ĐỘ) ---
    { t: 'Vecto trong không gian', id: 'phvpqxLNTUQ' },
    { t: 'Tích vô hướng và góc giữa hai vecto', id: '7XaLq6-i3T8' },
    { t: 'Hệ trục Oxyz', id: 'uzN97cFH1II' },
    { t: 'Biểu thức tọa độ vecto trong không gian', id: 'G-9G2nDnwqA' },
    { t: 'Tọa độ điểm, tọa độ vecto', id: '4vaNd0hCoIA' },
    { t: 'Hình không gian, tích có hướng', id: 'FiK4WDKmqWE' },
    { t: 'Cách bấm máy tích vô hướng, tích có hướng', id: 'ufmbgu4FQeE' },
    { t: 'Vecto trong không gian full dạng', id: '1ktkwWXTsAs' },
    { t: 'Ôn tọa độ vecto đề 1', id: 'uwcmSp-WsZY' },
    { t: 'Ôn tọa độ vecto đề 2', id: 'CotrgHdPpvU' },
    { t: 'Ôn tọa độ vecto đề 3', id: 'UL0LyL6YVMk' },

    // --- CHUYÊN ĐỀ 6: MẶT PHẲNG, ĐƯỜNG THẲNG, MẶT CẦU ---
    { t: 'Phương trình mặt phẳng', id: 'nnMrv6ZGgIE' },
    { t: 'Pt mặt phẳng (Video 2)', id: 'PqZefHWRy5k' },
    { t: 'Ôn tập pt mặt phẳng', id: 'w3zfFjKbqfs' },
    { t: 'Phương trình đường thẳng P1', id: 'Zey1a4zUDVg' },
    { t: 'Phương trình đường thẳng P2', id: 'zB9PoS_5UXs' },
    { t: 'Phương trình mặt cầu', id: 'QTkfXTLyesk' },
    { t: 'Kỹ thuật trải phẳng hình', id: '850ZqO8D_oA' },

    // --- CHUYÊN ĐỀ 7: GÓC, KHOẢNG CÁCH & VẬN DỤNG CAO HÌNH HỌC ---
    { t: 'Góc và khoảng cách P1', id: 'GbZxmfrD6j0' },
    { t: 'Góc và khoảng cách P2', id: 'JeHJAhQxS04' },
    { t: 'Phương pháp Gán trục tọa độ P1', id: 'i_-elkt7hE0' },
    { t: 'Phương pháp Gán trục tọa độ P2', id: 'RgsUcoGnD-c' },
    { t: 'Phương pháp Gán trục tọa độ P3', id: 'gS1_B__tE9Y' },
    { t: 'Cực trị hình học Maxmin', id: '42HdEgCcAmU' },
    { t: 'Tâm tỉ cự', id: 'ulZYfnAWkRo' },

    // --- CHUYÊN ĐỀ 8: XÁC SUẤT & THỐNG KÊ ---
    { t: 'Khoảng biến thiên và khoảng tứ phân vị', id: '1Z_YVju9-fk' },
    { t: 'Mẫu số liệu ghép nhóm và các số xu thế đặc trưng', id: 'Z2ssSY4atIA' },
    { t: 'Xác suất có điều kiện', id: '73Ft8fDSc3c' },
    { t: 'Xác suất toàn phần', id: '2ZsjfFccH0s' },
    { t: 'Công thức Bayes xác suất', id: 'ZN4LSnQLEyc' },
    { t: 'Xác suất tổng hợp kiến thức ba khối', id: 'p-qb67DCrAE' }
        ],
        docs: [
            { t: '50 đề thi minh họa', url: 'https://drive.google.com/file/d/1RyXb7KnEsX2uXgOQFq4Pn8WqxO0anGtA/preview' }
        ],
        exams: []
    },
    'Lý': { videos: [], docs: [], exams: [] },
    'Hóa': { videos: [
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
    docs:  [
  { t: '17. THPT Diên Hồng - TP Hồ Chí Minh (Lần 1)', url: 'https://drive.google.com/file/d/1-npZX-S6gHroRmB1PrrxUR63Zz7OsA-l/preview' },
  { t: '31. Sở GDĐT Bắc Ninh (Đề tập huấn)', url: 'https://drive.google.com/file/d/128qwE7iP5a1gbqUwBt0OK5PlllaPR7wk/preview' },
  { t: '29. THPT Hậu Lộc 1 - Thanh Hóa', url: 'https://drive.google.com/file/d/13FB6erjFXLV8bl5bTzjK1RyE49blNL0w/preview' },
  { t: '43. THPT Tân Kỳ - Nghệ An (Lần 1)', url: 'https://drive.google.com/file/d/13XfDRLWxwBHa5NJA5Uw_5E4tuox4dcjV/preview' },
  { t: '15. THPT Cù Huy Cận - Hà Tĩnh', url: 'https://drive.google.com/file/d/15Z5qNvElk6YslyQtTrgYaxpPP-LgcDsd/preview' },
  { t: '1. THPT Lương Tài 2 - Bắc Ninh - Lần 1 (Form mới)', url: 'https://drive.google.com/file/d/16GlaMCJDav7UlNAHDxqwS7rc6CJ3CLfx/preview' },
  { t: '11. Cụm Bắc Ninh (Lần 2)', url: 'https://drive.google.com/file/d/16fwadBFQiQLWWquPuYLeJD0iUZhAWCb4/preview' },
  { t: '42. THPT Quang Trung - Hải Phòng (Lần 1)', url: 'https://drive.google.com/file/d/16luYZFk6aRHiHZclQTkOuReMkc9Spl8I/preview' },
  { t: '6. THPT Chuyên Lê Hồng Phong - Nam Định - Lần 1 (Form mới)', url: 'https://drive.google.com/file/d/19ls2fxPMYvkQyynORn7GF-B3UInx59vL/preview' },
  { t: '33. Sở GDĐT Thanh Hóa (Lần 1)', url: 'https://drive.google.com/file/d/19lwFHo394o6V6dQ5OntD8cID4uexUTWN/preview' },
  { t: '37. THPT Kinh Môn - Hải Dương (Lần 1)', url: 'https://drive.google.com/file/d/1EEL22TvI2or-njv_u6u0Dp8jgD9JvYRK/preview' },
  { t: '9. THPT Chuyên Lê Quý Đôn - Bà Rịa Vũng Tàu (Lần 1)', url: 'https://drive.google.com/file/d/1Et1cs32kNTexOwhWfhrk-G2UXz5CHNrx/preview' },
  { t: '44. Chuyên Lê Quý Đôn - Đà Nẵng (Lần 1)', url: 'https://drive.google.com/file/d/1GBJ1TvrykKOom-XrrjJFL_PdJ_1NDkqQ/preview' },
  { t: '40. Sở GDĐT Lạng Sơn (Lần 1)', url: 'https://drive.google.com/file/d/1H6k77r8mdC_Vy9VONHZ6RKWzw_gKuGOS/preview' },
  { t: '21. Sở GDĐT Hà Tĩnh (Lần 1)', url: 'https://drive.google.com/file/d/1JOQ0mdKdE5RWz62siPgZU2ID7AbopXfa/preview' },
  { t: '10. THPT Chuyên Phan Bội Châu - Nghệ An (Lần 1)', url: 'https://drive.google.com/file/d/1L-CAofmKymD0Tg0sEwjMQ7lmqQGg5hNn/preview' },
  { t: '38. THPT Lê Chân - Hải Phòng (Lần 1)', url: 'https://drive.google.com/file/d/1Ma1psKt4uf5NB5ywr9zSShEEHVptrrBn/preview' },
  { t: '27. THPT Hàm Rồng - Thanh Hóa (Lần 1)', url: 'https://drive.google.com/file/d/1N6QnGh5R6ghEaNlwsN5oV95z4JEMYsQV/preview' },
  { t: '16. THPT Kiến An - Hải Phòng (Lần 1)', url: 'https://drive.google.com/file/d/1QyajGiimG5weTIMqxEUifQQ5zIIKx55B/preview' },
  { t: '22. Chuyên Hạ Long - Quảng Ninh (Lần 1)', url: 'https://drive.google.com/file/d/1R8NUgP-6SORYCid6OvZTq_xfhjLOsP_U/preview' },
  { t: '28. Cụm Liên trường THPT - Thanh Hóa', url: 'https://drive.google.com/file/d/1S2hheHO553jD-aj2dpKoxig3m509ErUx/preview' },
  { t: '35. Sở GDĐT Vĩnh Phúc (Lần 1 - Đề 2)', url: 'https://drive.google.com/file/d/1SkQCoS5fCxc6DLcLubjryGrpvGSBFW1P/preview' },
  { t: '23. THPT Tiên Du 1 - Bắc Ninh (KS đầu năm)', url: 'https://drive.google.com/file/d/1UVR1t4SWH2nIDLfvbrZs9j0BdVpZQAoP/preview' },
  { t: '7. THPT Nguyễn Khuyến - TP HCM - Lần 1 (Form mới)', url: 'https://drive.google.com/file/d/1XCuuHlgyai6-6XAMFSYVBlDPF2VgX4i_/preview' },
  { t: '25. Cụm chuyên môn số 3 - Đắk Lắk (Lần 1)', url: 'https://drive.google.com/file/d/1ZZMXWdGaQdNnAclecsMi-zI02jYGP3Az/preview' },
  { t: '39. Sở GDĐT Phú Thọ (Lần 1)', url: 'https://drive.google.com/file/d/1_s8oZt85nSNUwZeU88ch3cN5yJbd9ccj/preview' },
  { t: '13. Sở GD&ĐT TP HCM', url: 'https://drive.google.com/file/d/1_ymXXEGl0_niieFee-gd-7UvDutSrYz6/preview' },
  { t: '36. Sở GDĐT Yên Bái (Đề thử nghiệm)', url: 'https://drive.google.com/file/d/1cjXQVLngyHFixsNcKBayXqHVoXBEmY7N/preview' },
  { t: '46. Liên trường Nghệ An (Lần 1)', url: 'https://drive.google.com/file/d/1dQme-6neci_1N4n79hd9uT7kGcsW7fbB/preview' },
  { t: '2. THPT Nguyễn Viết Xuân - Vĩnh Phúc (Form mới)', url: 'https://drive.google.com/file/d/1eS5gQ5d1xVBy_HuCbuFA5TnAoHwF6YiN/preview' },
  { t: '19. Chuyên KHTN Hà Nội (Lần 1)', url: 'https://drive.google.com/file/d/1emeWAZsOZFmGmEsjlJYsgUAf5Baxzg9P/preview' },
  { t: '4. THPT Chuyên Phan Bội Châu - Nghệ An (Form mới)', url: 'https://drive.google.com/file/d/1erdM9Ma4PrtPZOtInrfSeiRhp0o1S-IP/preview' },
  { t: '12. Cụm Hải Dương (Lần 1)', url: 'https://drive.google.com/file/d/1fUZl9Np844sjLDnPVnj4gMQO8cSvEmwX/preview' },
  { t: '20. Sở GDĐT Tuyên Quang (Lần 1)', url: 'https://drive.google.com/file/d/1gwxCcPIsIIWdg8pY_23mzsXIajr4SoZX/preview' },
  { t: '14. THPT Lê Thánh Tông - TP Hồ Chí Minh', url: 'https://drive.google.com/file/d/1hhI0dh93CBjGy8EqqfhjOtvOw3dBsMXv/preview' },
  { t: '5. THPT Tiên Du - Bắc Ninh - Lần 1 (Form mới)', url: 'https://drive.google.com/file/d/1hxMWkjybxjx-i80naC9kmTKjS_h_xwqt/preview' },
  { t: '41. THPT Lương Ngọc Quyến - Thái Nguyên (Lần 1)', url: 'https://drive.google.com/file/d/1iEncBjtrf8Nwsgga38b2bmCRaRwIaQZ-/preview' },
  { t: '45. Chuyên Trần Phú - Hải Phòng (Lần 1)', url: 'https://drive.google.com/file/d/1itSBUXNF0EhBg6dnOtLmmMZrP_QTm5Dn/preview' },
  { t: '26. THPT Hà Trung - Thanh Hóa (Lần 1)', url: 'https://drive.google.com/file/d/1j-deYNYXy_abgOKkIKDM4jD5mcpoq9kD/preview' },
  { t: '3. Sở GD&ĐT Ninh Bình (Form mới)', url: 'https://drive.google.com/file/d/1jjZPtsRq075y9edhyTgC-JswRaIR7iA2/preview' },
  { t: '18. Sở GDĐT Vĩnh Phúc (Lần 1)', url: 'https://drive.google.com/file/d/1mM9mB3vTeQzRUps6Ez5f05YeF6VeNwbZ/preview' },
  { t: '34. Sở GDĐT Quảng Bình (Lần 1)', url: 'https://drive.google.com/file/d/1mmrdv9uo77Fcq2KgA0daf8KDpRCmovig/preview' },
  { t: '30. THPT Yên Lạc - Vĩnh Phúc (Lần 1)', url: 'https://drive.google.com/file/d/1swprSc3DPvDUgZJOryUHMETYurOqBRg_/preview' },
  { t: '24. THPT Thuận Thành 1 - Bắc Ninh (KS đầu năm)', url: 'https://drive.google.com/file/d/1trpsm0CR8avXHCY4P8NlY24K979zwqUU/preview' },
  { t: '8. THPT Chuyên Bắc Ninh (Lần 2)', url: 'https://drive.google.com/file/d/1u4qZXMCuEDSGzsybAmoU-VG8Nchj2brX/preview' },
  { t: '47. Sở GDĐT Ninh Bình (Lần 2)', url: 'https://drive.google.com/file/d/1vNK8QB5l2aba_aU3Uhgkw38Lwm0nWBIW/preview' },
  { t: '32. Sở GDĐT Bắc Giang (Lần 1)', url: 'https://drive.google.com/file/d/1wQKv-2TK5WGtgHB7aDfjfUgvdZyIyCEz/preview' }
],
    exams: [

    ] },
    'Văn': { videos: [], docs: [], exams: [] },
    'Anh': { videos: [
    // --- CHUYÊN ĐỀ 1: LÝ THUYẾT THÌ VÀ TỔNG QUAN ---
    { t: 'Lý thuyết Thì P1', id: 'RhTBbwdubCE' },
    { t: 'Lý thuyết Thì P2', id: '7zmvNiTciPE' },
    { t: 'Lý thuyết Thì P3', id: 'FiFAds-igmo' },
    { t: 'Tổng hợp 12 thì tiếng Anh', id: 'bCngYqYPTGo' },

    // --- CHUYÊN ĐỀ 2: NGỮ PHÁP & TỪ VỰNG TRỌNG ĐIỂM ---
    { t: 'Ngữ pháp trọng điểm P1', id: 'PtwEG_HTpZc' }, // (Bao gồm Từ vựng trọng điểm)
    { t: 'Ngữ pháp trọng điểm P2', id: 'DIGnztUiS14' },
    { t: 'Cụm động từ (Phrasal Verbs)', id: '3pl8SDVMrOI' },
    { t: 'Từ loại (Word Forms)', id: 'U9dJhVPc22E' },
    { t: 'Dạng bài Sắp xếp lá thư/câu P1', id: 'ccF4h-a9Ax0' },
    { t: 'Dạng bài Sắp xếp lá thư/câu P2', id: '6F7OSNcC_z0' },
    { t: 'Dạng bài Điền thông báo quảng cáo', id: 'i5g1256BPbE' },

    // --- CHUYÊN ĐỀ 3: KHÓA HỌC LẤY GỐC CẤP TỐC ---
    { t: 'Lấy gốc cấp tốc P1', id: 'Jlo1LZH-JZM' },
    { t: 'Lấy gốc cấp tốc P2', id: 'xFba8DGAZyU' },
    { t: 'Lấy gốc cấp tốc P3', id: 'WvuHUJKJ-sE' },
    { t: 'Lấy gốc cấp tốc P4', id: 'GbquI1EYiu4' },
    { t: 'Lấy gốc cấp tốc P5', id: '_VgDH1GWO2w' },
    { t: 'Lấy gốc cấp tốc P6', id: 'QW44ppTRTw8' },
    { t: 'Lấy gốc cấp tốc P7', id: 'O5D401AgJaw' },
    { t: 'Lấy gốc cấp tốc P8', id: 'X1JO1Yrg6YA' },

    // --- CHUYÊN ĐỀ 4: LUYỆN ĐỀ THI ---
    { t: 'Luyện đề thi số 1', id: 'fX8-yvGz7fc' },
    { t: 'Luyện đề thi số 2', id: 'hSgN6jsl48w' },
    { t: 'Luyện đề thi số 3', id: '4Cjc67pk_kA' },
    { t: 'Luyện đề thi số 4', id: 'n7zxmgpgZAU' },
    { t: 'Luyện đề thi số 5', id: '1TjNhxA7QL4' },
    { t: 'Luyện đề thi số 6', id: 'ICvrDOrNxzA' },
    { t: 'Luyện đề thi số 7', id: 'Nvy7mIGsCSE' },
    { t: 'Luyện đề thi số 8', id: 'u6FTyVsJNZA' },
    { t: 'Luyện đề thi số 9', id: 'eBhzB5hfC0w' },
    { t: 'Luyện đề thi số 10', id: 'DTjDjX_9zcw' }
],
        docs:[
  { t: '26. Sở giáo dục và đào tạo Vĩnh Phúc (Mã đề 904)', url: 'https://drive.google.com/file/d/10BqzpE6H49Ba-aYl9OLJVcCDnwb9CJrX/preview' },
  { t: '24. Sở giáo dục và đào tạo Vĩnh Phúc (Mã đề 902)', url: 'https://drive.google.com/file/d/10Qcf0Nr4V14Zz9EpUOSeHelmtqKDaHGa/preview' },
  { t: '16. THPT Mỹ Đức B - Hà Nội', url: 'https://drive.google.com/file/d/10dRse0kuZwgtEcSgyxxe3XrCdvPEVMla/preview' },
  { t: '11. Chuyên Võ Nguyên Giáp - Quảng Bình', url: 'https://drive.google.com/file/d/10lzPKSu_yyefVDdnyiTGG8CA8kSkcH-L/preview' },
  { t: '56. THPT Chuyên Hạ Long - Quảng Ninh', url: 'https://drive.google.com/file/d/13y77hlAzdF86koWrMhJ2IGxU4tyk2Pob/preview' },
  { t: '27. THPT Chuyên Bình Long - Bình Phước', url: 'https://drive.google.com/file/d/164VWvDTvUEuaqabDYNETyY23qKTUvNoi/preview' },
  { t: '35. Cụm Chuyên môn số 3 - Đắk Lắk', url: 'https://drive.google.com/file/d/16DuDvpZ4NqBZIlzLbQVEMIQsziB8mlIG/preview' },
  { t: '37. Sở giáo dục và đào tạo Tuyên Quang - Mã đề chẵn', url: 'https://drive.google.com/file/d/16vy1aj8dLnoBD65Op68g-oomF3KwQ1SM/preview' },
  { t: '46. Cụm liên trường THPT Quảng Nam', url: 'https://drive.google.com/file/d/17Nk4W7IzRR-R99UCJ5MomTWN0Od5hfKb/preview' },
  { t: '40. THPT Hậu Lộc 1 - Thanh Hóa', url: 'https://drive.google.com/file/d/17guOpgNJqcOcAk3fMrayPR87przxrQ1m/preview' },
  { t: '13. THPT Chuyên Quang Trung - Bình Phước - Lần 1', url: 'https://drive.google.com/file/d/18SSohnDiIj44bbPFlwiHjPVb5BJGDUud/preview' },
  { t: '51. Sở giáo dục và đào tạo Phú Thọ', url: 'https://drive.google.com/file/d/1A96krNuqNpGuYpJ3_Qws7_MzrrudO4r-/preview' },
  { t: '49. THPT Thuận Thành 1&2 - Bắc Ninh (Mã đề lẻ)', url: 'https://drive.google.com/file/d/1AgnB3RWLBfvBPGSxZB-r_Ok5Z9IqyMqq/preview' },
  { t: '36. Sở giáo dục và đào tạo Bắc Giang', url: 'https://drive.google.com/file/d/1EHRpLV6Qf7ieBKyUYBgqUuCrWwI-P4p4/preview' },
  { t: '4. Sở giáo dục và đào tạo Ninh Bình (Mã đề lẻ)', url: 'https://drive.google.com/file/d/1F9wI0-BtQycSEes6UioBIm6wS48dpn37/preview' },
  { t: '31. THPT Chuyên Nguyễn Tất Thành - Kon Tum', url: 'https://drive.google.com/file/d/1HtmWpqEgWnktm4LcSuUzC1aZa5TX_pXc/preview' },
  { t: '20. THCS - THPT Nguyễn Khuyến - TP.HCM', url: 'https://drive.google.com/file/d/1IWa4sIcaqecXa019RroSwcdZY0oYTVRX/preview' },
  { t: '34. THPT Đào Duy Từ - Thanh Hóa (Lần 2)', url: 'https://drive.google.com/file/d/1JJJwIVvTSU439zUN1sEvr8FH1TpfzWa9/preview' },
  { t: '3. THPT Ngô Gia Tự - Vĩnh Phúc - Lần 1', url: 'https://drive.google.com/file/d/1JdXN6yyz0uy7HTQ9xaHbES33JbgH4vYE/preview' },
  { t: '44. THPT Lê Lợi - Thanh Hóa', url: 'https://drive.google.com/file/d/1K6i791d03Cw8Tx7w0hvj4Y3E_MUppuqb/preview' },
  { t: '33. THPT Thành Đông - Hải Dương', url: 'https://drive.google.com/file/d/1KbbbZdbNAWr4CcxrPnM1cq2uhxwLfjpN/preview' },
  { t: '48. Liên trường THPT Hải Phòng', url: 'https://drive.google.com/file/d/1LFNRHjLzPU7jvgnnoNJ8_uJ-YT8Ub28G/preview' },
  { t: '41. Cụm các trường Phía Nam Hưng Yên', url: 'https://drive.google.com/file/d/1LwwGy3BNG32oDoho7bNFw_6XmgjHBOJy/preview' },
  { t: '32. THPT Chuyên Đại học Vinh - Nghệ An', url: 'https://drive.google.com/file/d/1MQl4FxKJYqShKoRbLCQCoYr_yaga6lWZ/preview' },
  { t: '30. THPT Chuyên Trần Phú - Hải Phòng', url: 'https://drive.google.com/file/d/1N3gdKtrwFl2KJZyW5OF0pjuT6SGPyWAF/preview' },
  { t: '52. Sở giáo dục và đào tạo Thanh Hóa', url: 'https://drive.google.com/file/d/1Nxeo93-7vWErWApP2Ka-kjmBOa8IBDya/preview' },
  { t: '6. THPT Thuận Thành 3 - Bắc Ninh (Mã đề chẵn)', url: 'https://drive.google.com/file/d/1Pn5rCvz4GoGgDfSunp1M4BWiTYTAIHR1/preview' },
  { t: '9. Chuyên Vĩnh Phúc (Lần 1)', url: 'https://drive.google.com/file/d/1QBxMMYCJq5L1Q_AzB2azwNE5f9RYb98Q/preview' },
  { t: '5. THPT Sơn Thịnh - Yên Bái', url: 'https://drive.google.com/file/d/1QUIJd4tlBsQ7jP7BFoygN_uSkjpQWZhr/preview' },
  { t: '38. Sở giáo dục và đào tạo Tuyên Quang - Mã đề lẻ', url: 'https://drive.google.com/file/d/1T2v8PnBPtRJtzctyk4txVH9hBjaOZZug/preview' },
  { t: '50. THPT Ba Đình - Thanh Hóa', url: 'https://drive.google.com/file/d/1TYG-zvFbbu-SQNQyEjxfwK4_42FWI9DZ/preview' },
  { t: '28. THPT Chuyên Chu Văn An - Lạng Sơn', url: 'https://drive.google.com/file/d/1V-WVAAKKTxL09CInIfhZ16p_0t2kTh3b/preview' },
  { t: '18. THPT Nguyễn Trãi (Thường Tín - Hà Nội)', url: 'https://drive.google.com/file/d/1VzecWlay8LSESek1JnpMA2c3IBTy-8jW/preview' },
  { t: '21. Cụm Liên trường THPT Hải Dương', url: 'https://drive.google.com/file/d/1ZE6HSk4UM5yTHbbieBgL5UP5TANjtKrQ/preview' },
  { t: '1. THPT Kỳ Anh - Hà Tĩnh', url: 'https://drive.google.com/file/d/1_PY6Upvydqysv9PvasEKDRB0N0IFTtPZ/preview' },
  { t: '8. THPT Gò Công Đông - Tiền Giang', url: 'https://drive.google.com/file/d/1a1zSHtbXTQlZRl1uXqmJ_bbPG03HF1QG/preview' },
  { t: '2. THPT Chuyên Nguyễn Tất Thành - Yên Bái', url: 'https://drive.google.com/file/d/1b2c9GE9A1f9fJjmL0a01lm3NuaAT8IGa/preview' },
  { t: '45. THPT Tuệ Tĩnh - Hải Dương', url: 'https://drive.google.com/file/d/1b3hZIY4h0a61mkzDd6teaaIBZ-PZTM1Y/preview' },
  { t: '55. THPT Chuyên Lê Thánh Tông - Quảng Nam', url: 'https://drive.google.com/file/d/1bWnxOLEf0LbThueXpdG1745Jw5766zCf/preview' },
  { t: '10. Sở giáo dục và đào tạo Yên Bái (Mã lẻ)', url: 'https://drive.google.com/file/d/1cMwGlXrhYR6xzBCh_teBdyKEN5KGPIi8/preview' },
  { t: '5. THPT Sơn Thịnh - Yên Bái (Bản 2)', url: 'https://drive.google.com/file/d/1dKcAUueGYlIECcv9FPV2D6IpaOZMhguC/preview' },
  { t: '43. Cụm liên trường THPT Nam Đàn - Thái Hòa (Nghệ An)', url: 'https://drive.google.com/file/d/1e0YAnGGiZmNelV2FS9BYBaP9Gv0dMsl5/preview' },
  { t: '42. Cụm các trường THPT tỉnh Hải Dương', url: 'https://drive.google.com/file/d/1hG9ZB95UVhhaGc-vewzI1qjvou29sxzp/preview' },
  { t: '47. Cụm liên trường THPT Thanh Hóa', url: 'https://drive.google.com/file/d/1jZtvCO6O-vUH6sRRmbMBGEZ24CRwNOox/preview' },
  { t: '7. Chuyên Phan Bội Châu – Nghệ An', url: 'https://drive.google.com/file/d/1lodDpTCoIvr8ZXEwXMR36uhq22V_BvyP/preview' },
  { t: '19. THPT Nghèn - Hà Tĩnh', url: 'https://drive.google.com/file/d/1mm2k4MtUjEEskW1c9gX4mlYxxbO6CHnL/preview' },
  { t: '17. THPT Kinh Môn - Hải Dương', url: 'https://drive.google.com/file/d/1mvuktIfP2tqXxAoqxPEZPsgAjpNW5BTo/preview' },
  { t: '12. THPT Nguyễn Khuyến - Bình Dương', url: 'https://drive.google.com/file/d/1nFqoH7rcD4u6urzCF9pf288EojDH78Rd/preview' },
  { t: '22. Sở giáo dục và đào tạo Bắc Ninh', url: 'https://drive.google.com/file/d/1oJAAaqjjojcBr4sOtAJgwvDPgIbGSN46/preview' },
  { t: '25. Sở giáo dục và đào tạo Vĩnh Phúc (Mã đề 903)', url: 'https://drive.google.com/file/d/1oYHnf3yqVJUuI09GYArd0Y670Ya4tzOT/preview' },
  { t: '23. Sở giáo dục và đào tạo Vĩnh Phúc (Mã đề 901)', url: 'https://drive.google.com/file/d/1ol4u8ZemsNJ8b54F2pw8-4uCNHd7AEce/preview' },
  { t: '14. THPT Nguyễn Quang Diệu - Đồng Tháp - Lần 1', url: 'https://drive.google.com/file/d/1pPkvoJKi7S_QyTJ4SJJplj6F9W6mC7XC/preview' },
  { t: '15. THPT Hoàng Văn Thụ - Hà Nội - Lần 1', url: 'https://drive.google.com/file/d/1rKAsBcCvl2PmkcgqZ5RUUmjw4PsQRjFs/preview' },
  { t: '29. Liên trường THPT Nghệ An (Mã đề chẵn)', url: 'https://drive.google.com/file/d/1u90WPkPBPv_Tm3eOtn8mb0g5pmuvs1s4/preview' },
  { t: '39. THPT Chuyên Nguyễn Văn Trỗi - Hà Tĩnh', url: 'https://drive.google.com/file/d/1umgawAJv0IX1kfRpg1VbTW4xIK01Bj6z/preview' },
  { t: '54. Sở giáo dục và đào tạo Ninh Bình (Lần 2)', url: 'https://drive.google.com/file/d/1v2KXUFNUFcoH7ttHnmlSHl0hFYGzxa_e/preview' },
  { t: '53. Liên trường THPT Nghệ An (Mã đề Lẻ)', url: 'https://drive.google.com/file/d/1x5kpd_NYr926HE7SJjmCmYvhOdh-6MW6/preview' },
  { t: '47. Cụm liên trường THPT Thanh Hóa (Bản 2)', url: 'https://drive.google.com/file/d/1xG95y2ojmmCl75jWqP9AlTsLqMlyVayD/preview' }
],
        exams: [] },
    'default': { videos: [], docs: [], exams: [] }
};

window.openSubject = (subj) => {
    const data = mockSubjectData[subj] || mockSubjectData['default'];
    document.getElementById('detail-subject-title').innerText = `Môn ${subj}`;
    document.getElementById('subj-content-video').innerHTML = data.videos.map((v, i) => `
        <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center">
            <span class="font-bold text-sm">Bài ${i+1}: ${v.t}</span>
            <button onclick="playVideo('${v.id}')" class="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700">Học</button>
        </div>
    `).join('') || '<p class="text-gray-400 mt-2">Chưa có video.</p>';
    document.getElementById('subj-content-doc').innerHTML = data.docs.map(d => `
        <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center border-l-4 border-blue-500">
            <span class="font-bold text-sm"><i class="fas fa-file-pdf text-blue-500"></i> ${d.t}</span>
            <button onclick="openEmbedModal('${d.url}', '${d.t}')" class="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"><i class="fas fa-eye"></i> Xem</button>
        </div>
    `).join('') || '';
    switchSubjectTab('video');
    window.handleNavReal('subject-detail');
};

window.openEmbedModal = (url, title) => {
    document.getElementById('embed-title').innerText = title;
    document.getElementById('embed-frame').src = url;
    document.getElementById('embed-modal').classList.remove('hidden');
};
window.closeEmbedModal = () => {
    document.getElementById('embed-modal').classList.add('hidden');
    document.getElementById('embed-frame').src = '';
};

window.switchSubjectTab = (tab) => {
    ['video', 'doc', 'exam'].forEach(t => {
        const btn = document.getElementById(`tab-subj-${t}`);
        const content = document.getElementById(`subj-content-${t}`);
        if(t===tab) { btn.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600'); btn.classList.remove('text-gray-500'); content.classList.remove('hidden-section'); }
        else { btn.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600'); btn.classList.add('text-gray-500'); content.classList.add('hidden-section'); }
    });
};
window.playVideo = (vidId) => {
    document.getElementById('video-modal').classList.remove('hidden'); if(player) player.loadVideoById(vidId); else player = new YT.Player('youtube-player', { height: '100%', width: '100%', videoId: vidId, playerVars: { 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0 }, events: { 'onStateChange': onPlayerStateChange } }); 
};
function onPlayerStateChange(event) { if (event.data == YT.PlayerState.PLAYING) videoTimer = setInterval(strictVideoLoop, 1000); else clearInterval(videoTimer); }
function strictVideoLoop() { if(!player || !player.getDuration) return; const cur = player.getCurrentTime(), dur = player.getDuration(), per = (cur/dur)*100; document.getElementById('video-bar').style.width = per + '%'; document.getElementById('video-percent').innerText = Math.round(per) + '%'; const m = Math.floor(cur/60), s = Math.floor(cur%60); document.getElementById('video-time').innerText = `${m}:${s<10?'0'+s:s}`; if (player.isMuted()) player.unMute(); }
window.closeVideoModal = () => { document.getElementById('video-modal').classList.add('hidden'); if(player && player.stopVideo) player.stopVideo(); clearInterval(videoTimer); };

// ============================================================
// --- LOGIC QUẢN LÝ NHÓM NÂNG CAO (ĐÃ CHUẨN HÓA) ---
// ============================================================

// 1. Mở chi tiết nhóm (Thay thế hoàn toàn openGroupMembers cũ)
window.openGroupDetail = async (gid) => {
    currentViewingGroupId = gid;
    const modal = document.getElementById('modal-group-detail');
    const nameDisplay = document.getElementById('group-detail-name');
    const idDisplay = document.getElementById('group-detail-id');
    
    modal.classList.remove('hidden');
    document.getElementById('group-members-list').innerHTML = '<p class="text-gray-400 text-center">Đang tải...</p>';
    document.getElementById('group-docs-list').innerHTML = '<p class="text-gray-400 text-center">Đang tải...</p>';

    const gSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid));
    if(!gSnap.exists()) { toast('Nhóm không tồn tại!', 'error'); modal.classList.add('hidden'); loadGroups(); return; }

    const gData = gSnap.data();
    nameDisplay.innerText = gData.name;
    idDisplay.innerText = gid;

    const isLeader = gData.leaderId === currentUser.uid;
    const isAdmin = userProfile.role === 'admin';
    const canManage = isLeader || isAdmin;

    const adminActions = document.getElementById('group-admin-actions');
    const uploadArea = document.getElementById('group-upload-area');
    
    if (canManage) {
        if(adminActions) adminActions.classList.remove('hidden');
        if(uploadArea) uploadArea.classList.remove('hidden');
    } else {
        if(adminActions) adminActions.classList.add('hidden');
        if(uploadArea) uploadArea.classList.add('hidden');
    }

    // Thêm nút Rời nhóm vào footer nếu không phải Leader
    if(!isLeader && !isAdmin) {
        adminActions.classList.remove('hidden');
        adminActions.innerHTML = `<button onclick="leaveGroup('${gid}')" class="w-full bg-red-100 text-red-600 py-2 rounded font-bold hover:bg-red-200"><i class="fas fa-sign-out-alt"></i> Rời nhóm này</button>`;
    } else if (canManage) {
        // Reset lại nội dung admin nếu là leader (vì ở trên có thể bị ghi đè bởi nút Leave)
        adminActions.innerHTML = `
            <span class="text-xs text-gray-400"><i class="fas fa-shield-alt"></i> Khu vực quản trị</span>
            <button onclick="handleDeleteGroup()" class="bg-red-100 text-red-600 px-4 py-2 rounded hover:bg-red-600 hover:text-white transition font-bold text-sm"><i class="fas fa-trash"></i> Xóa Nhóm</button>
        `;
    }

    switchGroupTab('members');
    renderGroupMembers(gData, gid, canManage);
    renderGroupDocs(gData, gid, canManage);
};

window.closeGroupModal = () => {
    document.getElementById('modal-group-detail').classList.add('hidden');
    currentViewingGroupId = null;
};

window.switchGroupTab = (tabName) => {
    const tabMem = document.getElementById('tab-grp-members');
    const tabDoc = document.getElementById('tab-grp-docs');
    const contentMem = document.getElementById('grp-tab-members');
    const contentDoc = document.getElementById('grp-tab-docs');

    if (tabName === 'members') {
        tabMem.className = "flex-1 py-2 font-bold border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50";
        tabDoc.className = "flex-1 py-2 font-bold text-gray-500 hover:text-indigo-600 hover:bg-gray-50";
        contentMem.classList.remove('hidden-section');
        contentDoc.classList.add('hidden-section');
    } else {
        tabDoc.className = "flex-1 py-2 font-bold border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50";
        tabMem.className = "flex-1 py-2 font-bold text-gray-500 hover:text-indigo-600 hover:bg-gray-50";
        contentDoc.classList.remove('hidden-section');
        contentMem.classList.add('hidden-section');
    }
};

async function renderGroupMembers(gData, gid, canManage) {
    const container = document.getElementById('group-members-list');
    container.innerHTML = '';
    
    for (const uid of gData.members) {
        let uName = 'Người dùng', uAva = '';
        try {
            const uSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid));
            if(uSnap.exists()) {
                uName = uSnap.data().displayName;
                uAva = uSnap.data().avatar;
            }
        } catch(e) {}

        const isMe = uid === currentUser.uid;
        const isMemberLeader = uid === gData.leaderId;
        
        let actionBtn = '';
        if (canManage && !isMe && !isMemberLeader) {
            actionBtn = `<button onclick="kickMember('${gid}', '${uid}', '${uName}')" class="text-red-500 hover:bg-red-100 px-2 py-1 rounded text-xs font-bold border border-red-200">Kích</button>`;
        }

        container.innerHTML += `
            <div class="flex items-center justify-between p-2 hover:bg-gray-50 rounded border-b last:border-0">
                <div class="flex items-center gap-2">
                    <img src="${uAva || 'https://ui-avatars.com/api/?name=U'}" class="w-8 h-8 rounded-full bg-gray-200">
                    <div>
                        <p class="text-sm font-bold ${isMemberLeader ? 'text-indigo-700' : 'text-gray-700'}">${uName} ${isMe ? '(Bạn)' : ''}</p>
                        ${isMemberLeader ? '<span class="text-[10px] bg-indigo-100 text-indigo-600 px-1 rounded">Trưởng nhóm</span>' : ''}
                    </div>
                </div>
                <div>${actionBtn}</div>
            </div>
        `;
    }
}

// Hàm kích thành viên (Đã sửa để reload đúng modal)
window.kickMember = async (gid, uid, name) => {
    if(!confirm(`Kích ${name} khỏi nhóm?`)) return;
    try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid), {
            members: arrayRemove(uid)
        });
        toast(`Đã kích ${name}.`, "success");
        openGroupDetail(gid); // Quan trọng: Reload modal chi tiết
    } catch(e) { toast("Lỗi: " + e.message, 'error'); }
};

// Hàm rời nhóm (Đã sửa)
window.leaveGroup = async (gid) => {
    if(!confirm("Rời nhóm này?")) return;
    try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid), {
            members: arrayRemove(currentUser.uid)
        });
        toast("Đã rời nhóm.", "success");
        closeGroupModal();
        loadGroups();
    } catch(e) { toast("Lỗi: " + e.message, 'error'); }
};

function renderGroupDocs(gData, gid, canManage) {
    const container = document.getElementById('group-docs-list');
    const docs = gData.documents || [];
    if (docs.length === 0) { container.innerHTML = `<div class="text-center py-6 text-gray-400 text-sm"><i class="fas fa-folder-open text-2xl mb-2"></i><br>Chưa có tài liệu.</div>`; return; }
    container.innerHTML = docs.map((docItem, index) => `
        <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition mb-2">
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="text-red-500 text-xl"><i class="fas fa-file-alt"></i></div>
                <div class="overflow-hidden">
                    <p class="text-sm font-bold truncate text-gray-700">${docItem.name}</p>
                    <p class="text-[10px] text-gray-400">${docItem.date} • ${docItem.uploaderName}</p>
                </div>
            </div>
            <div class="flex gap-2">
                <button onclick="downloadGroupDoc('${gid}', ${index})" class="text-blue-600 hover:bg-blue-50 p-2 rounded"><i class="fas fa-download"></i></button>
                ${canManage ? `<button onclick="deleteGroupDoc('${gid}', ${index})" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fas fa-trash"></i></button>` : ''}
            </div>
        </div>
    `).join('');
}

window.handleUploadGroupDoc = async () => {
    const file = document.getElementById('group-file-input').files[0];
    if (!file) return toast('Chọn file!', 'error');
    if (file.size > 1024 * 1024) return toast('File > 1MB!', 'error');
    const reader = new FileReader();
    reader.onload = async function(e) {
        const docObj = { name: file.name, data: e.target.result, type: file.type, date: new Date().toLocaleDateString('vi-VN'), uploaderId: currentUser.uid, uploaderName: userProfile.displayName };
        try {
            await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', currentViewingGroupId), { documents: arrayUnion(docObj) });
            toast('Upload xong!', 'success');
            document.getElementById('group-file-input').value = '';
            openGroupDetail(currentViewingGroupId);
        } catch (err) { toast('Lỗi: ' + err.message, 'error'); }
    };
    reader.readAsDataURL(file);
};

window.downloadGroupDoc = async (gid, index) => {
    try {
        const gSnap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid));
        const file = gSnap.data().documents[index];
        const a = document.createElement('a'); a.href = file.data; a.download = file.name;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch(e) { toast('Lỗi tải file', 'error'); }
};

window.deleteGroupDoc = async (gid, index) => {
    if(!confirm('Xóa file này?')) return;
    try {
        const gRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', gid);
        const docs = (await getDoc(gRef)).data().documents;
        await updateDoc(gRef, { documents: arrayRemove(docs[index]) });
        toast('Đã xóa!', 'success');
        openGroupDetail(gid);
    } catch(e) { toast('Lỗi: ' + e.message, 'error'); }
};

window.handleDeleteGroup = async () => {
    if (prompt("Nhập 'XOA' để xác nhận:") !== 'XOA') return;
    try {
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'groups', currentViewingGroupId));
        toast('Đã giải tán nhóm!', 'success');
        closeGroupModal();
        loadGroups();
    } catch (e) { toast('Lỗi: ' + e.message, 'error'); }
};
// ============================================
// --- BỔ SUNG: BẢNG XẾP HẠNG & LƯU ĐIỂM ---
// ============================================

// 1. Hàm tải dữ liệu bảng xếp hạng
window.loadLeaderboard = async () => {
    const tbody = document.getElementById('leaderboard-list');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500">Đang tải dữ liệu...</td></tr>';

    try {
        // Lấy danh sách user từ Firebase (giới hạn 50 người)
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory'), limit(50));
        const snap = await getDocs(q);
        let users = [];

        snap.forEach(d => {
            const u = d.data();
            // Nếu chưa có totalScore thì mặc định là 0
            users.push({ ...u, totalScore: u.totalScore || 0 });
        });

        // Sắp xếp: Điểm cao lên đầu
        users.sort((a, b) => b.totalScore - a.totalScore);

        // Render ra HTML
        tbody.innerHTML = '';
        users.forEach((u, index) => {
            let rankDisplay = `<span class="font-bold text-gray-500">#${index + 1}</span>`;
            let rowClass = "border-b hover:bg-gray-50";
            
            // Trang trí Top 3
            if (index === 0) {
                rankDisplay = '<span class="text-2xl">🥇</span>';
                rowClass = "border-b bg-yellow-50 hover:bg-yellow-100";
            } else if (index === 1) {
                rankDisplay = '<span class="text-2xl">🥈</span>';
            } else if (index === 2) {
                rankDisplay = '<span class="text-2xl">🥉</span>';
            }

            tbody.innerHTML += `
                <tr class="${rowClass} transition">
                    <td class="p-3 text-center align-middle">${rankDisplay}</td>
                    <td class="p-3 flex items-center">
                        <img src="${u.avatar}" class="w-10 h-10 rounded-full mr-3 border border-gray-200 shadow-sm">
                        <div class="flex flex-col">
                            <span class="font-bold text-gray-800 text-sm">${u.displayName}</span>
                            <span class="text-[10px] text-gray-400">${u.role.toUpperCase()}</span>
                        </div>
                    </td>
                    <td class="p-3 text-center font-bold text-indigo-600 text-lg">${u.totalScore}</td>
                </tr>
            `;
        });

        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-400">Chưa có ai chơi game cả. Hãy là người đầu tiên!</td></tr>';
        }

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center p-4 text-red-500">Lỗi tải dữ liệu: ${e.message}</td></tr>`;
    }
};

// 2. Hàm lưu điểm cộng dồn vào Profile User
window.handleGameOver = async (score) => {
    // Dừng game loop
    if (gameInterval) clearInterval(gameInterval);
    document.removeEventListener('keydown', handleSnakeKey); // Xóa sự kiện nếu là game Rắn

    // Thông báo
    alert(`Kết thúc game! Bạn đạt được: ${score} điểm.`);
    closeGame();

    if (score <= 0) return; // Không lưu nếu 0 điểm

    try {
        const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const currentScore = userSnap.data().totalScore || 0;
            const newTotal = currentScore + score;

            // Cập nhật điểm mới vào Firestore
            await updateDoc(userRef, { 
                totalScore: newTotal,
                lastGamePlayed: serverTimestamp()
            });
            
            // Cập nhật cả ở profile gốc
            await updateDoc(doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'profile', 'info'), { 
                totalScore: newTotal 
            });

            toast(`+${score} điểm tích lũy! Tổng: ${newTotal}`, 'success');
        }
    } catch (e) {
        console.error("Lỗi lưu điểm:", e);
    }
};
