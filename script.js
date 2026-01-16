// --- SỬ DỤNG PHIÊN BẢN ỔN ĐỊNH 10.8.0 (ĐỂ CHẠY ĐƯỢC TRÊN MOBILE) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser as firebaseDeleteUser } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, 
    doc, setDoc, getDoc, updateDoc, getDocs, arrayUnion, arrayRemove, limit, 
    deleteDoc, deleteField, increment // <--- Đã thêm increment vào đây
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Thêm dòng này để kiểm tra xem script đã chạy chưa (nếu thấy thông báo này trên đt là OK)
console.log("Firebase Script Loaded v10.8.0");

// 1. CẤU HÌNH (PROJECT MỚI)
const firebaseConfig = {
  apiKey: "AIzaSyB-vDgQYw-yT9B1hQQy0VyEc-BrZOVh3Sw",
  authDomain: "onthi2026-2d0eb.firebaseapp.com",
  projectId: "onthi2026-2d0eb",
  storageBucket: "onthi2026-2d0eb.firebasestorage.app",
  messagingSenderId: "1016775391844",
  appId: "1:1016775391844:web:40a7931e1c895e62a3bd71",
  measurementId: "G-ZY0L1XMMNE"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const APP_ID = 'onthi2026-2d0eb';
// CONSTANTS
const ADMIN_EMAILS = ['taobacvietteam@gmail.com', 'admin@gmail.com']; // Thêm admin@gmail.com vào danh sách admin

// STATE
let currentUser = null;
let userProfile = null;
let currentChatType = 'global'; 
let currentChatTarget = null;
let player = null, videoTimer = null;
let gameInterval = null;

let currentAdminTab = 'users';
let currentViewingGroupId = null;

// INJECT YOUTUBE API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

// --- HELPER FUNCTIONS ---
function toast(msg, type='info') {
    const t = document.createElement('div');
    t.className = `p-4 rounded-lg text-white shadow-xl fade-in flex items-center ${type==='error'?'bg-red-500':'bg-green-600'} text-sm max-w-[90vw] z-50 fixed bottom-5 right-5`;
    t.innerHTML = `<i class="fas ${type==='error'?'fa-exclamation-circle':'fa-check-circle'} mr-2"></i> ${msg}`;
    document.body.appendChild(t); // Append to body to ensure visibility
    setTimeout(() => t.remove(), 3000);
}

// ==========================================
// --- AUTH SYSTEM (MODIFIED) ---
// ==========================================

window.handleLogin = async () => {
    try {
        const email = document.getElementById('auth-email').value;
        const pass = document.getElementById('auth-pass').value;
        if(!email || !pass) return toast('Vui lòng nhập đầy đủ thông tin', 'error');
        await signInWithEmailAndPassword(auth, email, pass);
    } catch(e) { toast('Lỗi đăng nhập: ' + e.message, 'error'); }
};

// 1. Thay đổi handleRegister: Không tạo user ngay mà hiện Modal thanh toán
window.handleRegister = () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();

    if(!email || !pass) return toast('Vui lòng nhập đầy đủ Email và Mật khẩu!', 'error');
    if(pass.length < 6) return toast('Mật khẩu phải từ 6 ký tự trở lên!', 'error');

    // Hiện modal thanh toán QR
    showPaymentModal(email);
};

// 2. Hàm hiện Modal QR (Tích hợp từ script cũ)
window.showPaymentModal = function(email) {
    const modal = document.getElementById('modal-payment-required');
    if (!modal) return toast('Lỗi: Không tìm thấy modal thanh toán trong HTML', 'error');

    const qrImg = document.getElementById('payment-qr-img');
    const contentDisplay = document.getElementById('payment-content-display');

    if (contentDisplay) contentDisplay.innerText = email;

    // Tạo mã QR VietQR
    const bankId = 'MB';
    const accountNo = '0344750735';
    const template = 'compact';
    const accountName = 'NGUYEN VU TAO';
    const content = email; 
    
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.jpg?addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(accountName)}`;
    
    if (qrImg) qrImg.src = qrUrl;
    
    modal.classList.remove('hidden');
};

// 3. Hàm xác nhận đã chuyển khoản -> Tiến hành tạo tài khoản Firebase
window.confirmPaymentSent = async function() {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value.trim();
    const modal = document.getElementById('modal-payment-required');
    const btnConfirm = modal.querySelector('button.bg-blue-600'); // Giả sử nút confirm có class này

    if (btnConfirm) {
        btnConfirm.disabled = true;
        btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
    }

    try {
        // Tạo User Authentication
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        
        const isAdmin = ADMIN_EMAILS.includes(email);
        const role = isAdmin ? 'admin' : 'student';
        // Admin mặc định active, user thường phải chờ duyệt (pending)
        const status = isAdmin ? 'active' : 'pending';
        
        const profile = {
            uid: cred.user.uid,
            email, 
            role, 
            displayName: email.split('@')[0], 
            avatar: `https://ui-avatars.com/api/?name=${email.split('@')[0]}&background=random`,
            isBlocked: false,
            status: status, // TRẠNG THÁI QUAN TRỌNG
            createdAt: serverTimestamp(),
            totalScore: 0
        };

        // Lưu song song vào 2 nơi
        await Promise.all([
            setDoc(doc(db, 'artifacts', APP_ID, 'users', cred.user.uid, 'profile', 'info'), profile),
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', cred.user.uid), profile)
        ]);

        modal.classList.add('hidden');
        
        if (status === 'pending') {
            toast('Đăng ký thành công! Vui lòng chờ Admin duyệt tài khoản.', 'success');
            // User sẽ bị signout ngay lập tức ở onAuthStateChanged vì status pending
        } else {
            toast('Đăng ký Admin thành công!', 'success');
        }

    } catch(e) {
        console.error(e);
        if(e.code === 'auth/email-already-in-use') {
            toast('Email này đã được sử dụng!', 'error');
        } else if (e.code === 'auth/weak-password') {
            toast('Mật khẩu quá yếu (cần > 6 ký tự)', 'error');
        } else {
            toast('Lỗi: ' + e.message, 'error');
        }
    } finally {
        if (btnConfirm) {
            btnConfirm.disabled = false;
            btnConfirm.innerText = 'Đã chuyển khoản - Đăng ký ngay';
        }
    }
};

window.closePaymentModal = () => {
    document.getElementById('modal-payment-required').classList.add('hidden');
};

window.handleLogout = () => signOut(auth).then(() => window.location.reload());

// 4. Logic kiểm tra Active/Pending khi đăng nhập
onAuthStateChanged(auth, async (user) => {
    if(user) {
        const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'profile', 'info'));
        if(snap.exists()) {
            userProfile = snap.data();
            
            // --- KIỂM TRA TRẠNG THÁI ---
            if(userProfile.isBlocked) { 
                signOut(auth); 
                alert('Tài khoản bị khóa!'); 
                return; 
            }

            // Nếu user chưa được duyệt (status = pending) -> Kick ra
            if(userProfile.status === 'pending') {
                signOut(auth);
                alert('Tài khoản của bạn đang chờ Admin (Nguyễn Vũ Tạo) duyệt thanh toán!\nVui lòng liên hệ Admin hoặc chờ đợi.');
                return;
            }
            
            currentUser = user;
            
            document.getElementById('auth-view').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden-section');
            updateProfileUI();
            
            if(userProfile.role === 'admin') document.getElementById('admin-menu').classList.remove('hidden');
            if(userProfile.role === 'leader' || userProfile.role === 'admin') document.getElementById('btn-create-group').classList.remove('hidden');

            window.handleNavReal = (viewId) => {
                document.querySelectorAll('#content-container > div').forEach(d => d.classList.add('hidden-section'));
                const target = document.getElementById(`view-${viewId}`);
                if(target) target.classList.remove('hidden-section');
                
                if(viewId === 'groups') loadGroups();
                if(viewId === 'admin') loadAdminStats();
                if(viewId === 'games') loadLeaderboard();
            };

            // logActivity('login', 'Đăng nhập hệ thống'); // Optional logging
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
// --- HÀM ĐIỀU HƯỚNG CHÍNH (ĐÃ CẬP NHẬT FULL) ---
window.handleNavReal = (viewId) => {
    // 1. Ẩn tất cả các màn hình (view)
    document.querySelectorAll('#content-container > div').forEach(d => d.classList.add('hidden-section'));
    
    // 2. Hiện màn hình được chọn
    // - Nếu là 'ai-chat', hiện #view-ai-chat
    if (viewId === 'ai-chat') {
        document.getElementById('view-ai-chat').classList.remove('hidden-section');
    } 
    // - Nếu là 'hsa', hiện #view-hsa
    else if (viewId === 'hsa') {
        document.getElementById('view-hsa').classList.remove('hidden-section');
    }
    // - Các view còn lại (dashboard, subjects, groups...)
    else {
        const target = document.getElementById(`view-${viewId}`);
        if(target) target.classList.remove('hidden-section');
    }

    // 3. Tải dữ liệu tương ứng (nếu cần)
    if (viewId === 'groups') loadGroups();
    if (viewId === 'admin') loadAdminStats();
    if (viewId === 'games') loadLeaderboard();
    
    // 4. Riêng Chat thì reset taiitle
    if (viewId === 'chat') {
        // Mặc định về Chat Global nếu chưa chọn gì
        if (!currentChatTarget) switchChatTab('global');
    }
};

// ==========================================
// --- CHAT SYSTEM (FULL RESPONSIVE & VIDEO) ---
// ==========================================

// 1. Chuyển Tab (Chung / Riêng / Nhóm)
window.switchChatTab = (type) => {
    currentChatType = type;
    
    // Reset giao diện chat
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-list').innerHTML = '';
    
    // Cập nhật Header Title
    const headerTitle = document.getElementById('chat-title-display');
    
    // Nút Video Call HTML (Chỉ hiện khi cần)
    const videoBtnHtml = `
        <button onclick="startVideoCall()" class="text-gray-400 hover:text-indigo-600 p-2 transition rounded-full hover:bg-indigo-50 ml-2" title="Gọi Video">
            <i class="fas fa-video text-lg"></i>
        </button>
    `;

    if(type === 'global') {
        // Chat chung: Có thể ẩn nút gọi video nếu muốn tránh spam
        headerTitle.innerHTML = `<span class="truncate font-bold text-gray-700">Chat Chung</span> ${videoBtnHtml}`;
        currentChatTarget = 'global';
        
        // Mobile: Nếu bấm Chat chung thì mở luôn màn hình chat
        if(window.innerWidth < 768) window.openChatMobile();
        
        listenChat('global');
    } else if (type === 'private') {
        headerTitle.innerText = "Chọn người nhắn...";
        // Mobile: Ở chế độ private thì phải hiện list user trước (không mở chat ngay)
        if(window.innerWidth < 768) window.backToUserList(); 
        
        loadUserListForChat();
    } else if (type === 'group') {
        headerTitle.innerText = "Chọn nhóm...";
        if(window.innerWidth < 768) window.backToUserList();
        
        loadMyGroupsForChat();
    }
};

// 2. Load Danh sách User (Tab Riêng)
function loadUserListForChat() {
    getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory')).then(snap => {
        const list = document.getElementById('chat-list');
        list.innerHTML = ''; // Clear list cũ
        
        snap.forEach(d => {
            if(d.id === currentUser.uid) return; // Bỏ qua chính mình
            const u = d.data();
            
            const div = document.createElement('div');
            // Style item user trong list
            div.className = "p-3 bg-white rounded-lg border hover:bg-indigo-50 cursor-pointer flex items-center gap-3 mb-2 transition shadow-sm";
            div.innerHTML = `
                <div class="relative shrink-0">
                    <img src="${u.avatar}" class="w-10 h-10 rounded-full object-cover border border-gray-200">
                    <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                </div>
                <div class="overflow-hidden min-w-0">
                    <p class="font-bold text-gray-700 text-sm truncate">${u.displayName}</p>
                    <p class="text-xs text-gray-400 truncate">Bấm để nhắn tin</p>
                </div>
            `;
            
            // Sự kiện Click
            div.onclick = () => {
                currentChatTarget = d.id;
                
                // Cập nhật Header với nút Video
                const header = document.getElementById('chat-title-display');
                header.innerHTML = `
                    <div class="flex items-center justify-between w-full">
                         <span class="truncate font-bold text-gray-700">${u.displayName}</span>
                         <button onclick="startVideoCall()" class="text-gray-400 hover:text-indigo-600 p-2 transition rounded-full hover:bg-indigo-50" title="Gọi Video">
                            <i class="fas fa-video text-lg"></i>
                        </button>
                    </div>
                `;
                
                // Quan trọng: Gọi hàm mở chat mobile
                window.openChatMobile();
                
                listenChat('private_sorted', getChatId(currentUser.uid, d.id));
            };
            list.appendChild(div);
        });
    });
}

// 3. Load Danh sách Nhóm (Tab Nhóm)
function loadMyGroupsForChat() {
    getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups')).then(snap => {
         const list = document.getElementById('chat-list');
         list.innerHTML = '';
         
         snap.forEach(d => {
             const g = d.data();
             if(g.members.includes(currentUser.uid)) {
                 const div = document.createElement('div');
                 div.className = "p-3 bg-white rounded-lg border hover:bg-indigo-50 cursor-pointer flex items-center gap-3 mb-2 transition shadow-sm";
                 div.innerHTML = `
                    <div class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold border border-indigo-200 shrink-0">
                        <i class="fas fa-users"></i>
                    </div>
                    <div class="overflow-hidden min-w-0">
                        <p class="font-bold text-gray-700 text-sm truncate">${g.name}</p>
                        <p class="text-xs text-gray-400 truncate">Nhóm học tập</p>
                    </div>
                 `;
                 
                 div.onclick = () => {
                     // Gọi hàm mở chat group & mobile UI
                     openGroupChat(d.id, g.name);
                     window.openChatMobile();
                 };
                 list.appendChild(div);
             }
         });
    });
}

// Helper: Tạo ID hội thoại riêng tư
function getChatId(uid1, uid2) { return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`; }

// 4. Lắng nghe tin nhắn Realtime
let chatUnsub;
function listenChat(collectionName, docId) {
    if(chatUnsub) chatUnsub(); // Hủy listener cũ
    
    let collectionRef;
    if(collectionName === 'global') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global');
    else if (collectionName === 'private_sorted') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'chats', docId, 'messages');
    else if (collectionName === 'group') collectionRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups', docId, 'messages');

    if(collectionRef) {
        // Query: Sắp xếp theo thời gian, lấy 50 tin mới nhất
        const q = query(collectionRef, orderBy('ts', 'asc'), limit(50));
        
        chatUnsub = onSnapshot(q, snap => {
            const div = document.getElementById('chat-messages');
            div.innerHTML = ''; 
            
            snap.forEach(d => renderMsg(d.data(), d.id, div, collectionName, docId));
            
            // Auto scroll xuống đáy
            div.scrollTop = div.scrollHeight;
        });
    }
}

// 5. Mở chat nhóm (từ nút "Chat ngay" ở màn hình Nhóm hoặc từ Sidebar Chat)
window.openGroupChat = (gid, gname) => {
    // Nếu đang ở màn hình khác thì chuyển về màn hình Chat
    if(window.nav) window.nav('chat'); 
    else window.handleNavReal('chat');

    currentChatType = 'group';
    currentChatTarget = gid;
    
    const header = document.getElementById('chat-title-display');
    header.innerHTML = `
        <div class="flex justify-between items-center w-full gap-2">
            <span class="truncate pr-2 font-bold text-indigo-900">${gname}</span>
            <div class="flex items-center shrink-0">
                <button onclick="startVideoCall()" class="text-gray-400 hover:text-indigo-600 p-2 mr-1 rounded-full hover:bg-indigo-50 transition" title="Gọi Video Nhóm">
                    <i class="fas fa-video text-lg"></i>
                </button>
                <button onclick="openGroupDetail('${gid}')" class="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 font-bold whitespace-nowrap">
                    <i class="fas fa-info-circle"></i> <span class="hidden sm:inline">Chi tiết</span>
                </button>
            </div>
        </div>
    `;
    
    listenChat('group', gid);
    
    // Nếu là mobile thì mở view chat luôn
    if(window.innerWidth < 768) window.openChatMobile();
};

// 6. Gửi tin nhắn
window.sendChat = async () => {
    const input = document.getElementById('chat-input');
    const txt = input.value.trim();
    const imgElem = document.getElementById('img-prev-src');
    const img = imgElem ? imgElem.src : ''; 
    
    const hasImg = !document.getElementById('image-preview').classList.contains('hidden');
    
    if(!txt && !hasImg) return;
    
    // Dữ liệu tin nhắn
    const msgData = { 
        text: txt, 
        img: hasImg ? img : null, 
        uid: currentUser.uid, 
        name: userProfile.displayName || "User", 
        avatar: userProfile.avatar || "https://ui-avatars.com/api/?name=User", 
        ts: serverTimestamp(),
        reactions: {}
    };
    
    // Reset input ngay lập tức
    input.value = ''; 
    clearImage();

    try {
        if(currentChatType === 'global') 
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chat_global'), msgData);
        else if (currentChatType === 'private') 
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'chats', getChatId(currentUser.uid, currentChatTarget), 'messages'), msgData);
        else if (currentChatType === 'group') 
            await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'groups', currentChatTarget, 'messages'), msgData);
    } catch(e) { 
        console.error("Lỗi gửi tin nhắn:", e); 
    }
};

// 7. Render Tin nhắn (Bao gồm hiển thị cuộc gọi Video)
function renderMsg(msg, msgId, container, colName, docId) {
    const isMe = msg.uid === currentUser.uid;
    let reactionHtml = '';

    // Xử lý Reaction
    if (msg.reactions) {
        const counts = {};
        Object.values(msg.reactions).forEach(r => counts[r] = (counts[r] || 0) + 1);
        const reactionIcons = Object.keys(counts).map(k => 
            `<span class="ml-1 bg-white/90 px-1.5 py-0.5 rounded-full shadow-sm border text-[10px] text-gray-600">
                ${k} <span class="font-bold">${counts[k]}</span>
            </span>`
        ).join('');
        
        if (reactionIcons) {
            reactionHtml = `<div class="reaction-container absolute -bottom-2 ${isMe ? 'right-0' : 'left-0'} flex gap-1 z-10 whitespace-nowrap">${reactionIcons}</div>`;
        }
    }

    // Nút Reaction position
    const btnPositionClass = isMe ? '-left-8' : '-right-8';
    const pickerPositionClass = isMe ? 'right-0' : 'left-0';

    // Nội dung Text hoặc Thẻ Gọi Video
    let msgContent = '';
    if (msg.text && msg.text.startsWith('###CALL:')) {
        const roomId = msg.text.split(':')[1];
        msgContent = `
            <div class="bg-indigo-50 border border-indigo-100 rounded-lg p-3 my-1 flex flex-col items-center gap-2 min-w-[180px]">
                <div class="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center animate-pulse">
                    <i class="fas fa-video text-white text-lg"></i>
                </div>
                <p class="font-bold text-indigo-800 text-sm">Cuộc gọi video</p>
                <button onclick="joinMeeting('${roomId}')" class="bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-full shadow hover:bg-indigo-700 transition w-full">
                    <i class="fas fa-phone-alt mr-1"></i> Tham gia ngay
                </button>
            </div>
        `;
    } else {
        msgContent = msg.text ? `<span class="leading-relaxed block whitespace-pre-wrap">${msg.text}</span>` : '';
    }

    const html = `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} group chat-bubble relative mb-4 px-1 w-full animate-fade-in">
            ${!isMe ? `<img src="${msg.avatar}" class="w-8 h-8 rounded-full mr-2 self-end shadow-sm mb-1 object-cover flex-shrink-0">` : ''}
            
            <div class="max-w-[75%] md:max-w-[70%] relative group flex flex-col ${isMe ? 'items-end' : 'items-start'}">
                ${!isMe ? `<p class="text-[10px] text-gray-400 ml-1 mb-0.5 truncate max-w-full">${msg.name}</p>` : ''}
                
                <div class="p-2 md:p-3 rounded-2xl ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white border text-gray-800 shadow-sm rounded-bl-none'} relative text-sm md:text-base break-words min-w-[2rem]">
                    
                    ${msg.img ? `<img src="${msg.img}" class="rounded-lg mb-2 w-full object-cover cursor-pointer" onclick="window.open(this.src, '_blank')">` : ''}
                    
                    ${msgContent}
                    
                    <button class="reaction-trigger absolute top-1/2 transform -translate-y-1/2 ${btnPositionClass} 
                                   text-gray-400 hover:text-yellow-500 bg-white rounded-full w-6 h-6 flex items-center justify-center 
                                   shadow-sm border transition-all opacity-0 group-hover:opacity-100 z-20 md:opacity-0 focus:opacity-100" 
                            onclick="toggleReactionPicker('${msgId}')">
                        <i class="far fa-smile text-xs"></i>
                    </button>

                    <div id="picker-${msgId}" class="reaction-picker hidden absolute bottom-full mb-2 ${pickerPositionClass} 
                                               bg-white shadow-xl border rounded-full p-1 flex gap-1 z-50 min-w-max">
                        ${['❤️','😂','😮','😢','👍'].map(emoji => 
                            `<span class="reaction-btn cursor-pointer hover:bg-gray-100 p-1.5 rounded-full transition-transform hover:scale-125 text-base select-none" 
                                   onclick="addReaction('${colName}', '${docId}', '${msgId}', '${emoji}')">${emoji}</span>`
                        ).join('')}
                    </div>
                </div>
                ${reactionHtml}
            </div>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

// 8. Các hàm điều khiển UI Mobile
window.openChatMobile = function() {
    if (window.innerWidth < 768) {
        const sidebar = document.getElementById('chat-sidebar');
        const mainArea = document.getElementById('chat-main-area');
        
        if (sidebar) sidebar.classList.add('hidden');
        if (mainArea) {
            mainArea.classList.remove('hidden');
            mainArea.classList.add('flex');
        }
    }
};

window.backToUserList = function() {
    document.getElementById('chat-title-display').innerText = currentChatType === 'group' ? "Chọn nhóm..." : "Chọn người nhắn...";
    
    const sidebar = document.getElementById('chat-sidebar');
    const mainArea = document.getElementById('chat-main-area');

    if (sidebar) sidebar.classList.remove('hidden');
    if (mainArea) {
        mainArea.classList.add('hidden');
        mainArea.classList.remove('flex');
    }
};

// 9. Xử lý Reaction
window.toggleReactionPicker = (msgId) => {
    document.querySelectorAll('.reaction-picker').forEach(el => { 
        if (el.id !== `picker-${msgId}`) el.classList.add('hidden'); 
    });
    
    const p = document.getElementById(`picker-${msgId}`);
    if(p) { 
        p.classList.toggle('hidden'); 
        p.style.display = p.classList.contains('hidden') ? 'none' : 'flex';
        if(!p.classList.contains('hidden')) {
             setTimeout(() => { if(p) p.classList.add('hidden'); }, 3000); 
        }
    }
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
        const p = document.getElementById(`picker-${msgId}`);
        if(p) p.classList.add('hidden');
    }
};
// ==========================================
// --- MEETING & VIDEO CALL SYSTEM (MERGED) ---
// ==========================================

let meetingApi = null; // Sử dụng chung biến này cho cả Chat và Group Meeting

// 1. Logic Gọi Video từ Chat (Của hệ thống mới)
window.startVideoCall = async () => {
    if (!currentChatTarget) return alert("Vui lòng chọn người hoặc nhóm để gọi!");
    
    const confirmCall = confirm("Bạn muốn bắt đầu cuộc gọi video?");
    if (!confirmCall) return;

    // Tạo ID phòng: LT2026_CHATID_TIMESTAMP
    const roomId = `LT2026_${currentChatTarget}_${Date.now()}`;
    
    // Gửi link mời vào chat
    const callMsg = `###CALL:${roomId}`;
    const input = document.getElementById('chat-input');
    const originalVal = input.value;
    input.value = callMsg;
    
    // Ẩn ảnh tạm thời nếu có
    const wasImgHidden = document.getElementById('image-preview').classList.contains('hidden');
    if(!wasImgHidden) document.getElementById('image-preview').classList.add('hidden');
    
    await window.sendChat(); 
    
    // Restore trạng thái input
    input.value = originalVal;
    if(!wasImgHidden) document.getElementById('image-preview').classList.remove('hidden');

    // Tự động tham gia
    window.joinMeeting(roomId);
};

// 2. Logic Tham gia Video từ Chat (Của hệ thống mới)
window.joinMeeting = (roomId) => {
    // Chuyển view
    if(window.nav) window.nav('meeting'); else window.handleNavReal('meeting');
    
    const container = document.getElementById('meet-container');
    container.innerHTML = ""; 

    const domain = 'meet.jit.si';
    const options = {
        roomName: roomId,
        width: '100%',
        height: '100%',
        parentNode: container,
        userInfo: {
            displayName: userProfile.displayName || "User",
            email: currentUser.email
        },
        configOverwrite: { startWithAudioMuted: false, startWithVideoMuted: false },
        interfaceConfigOverwrite: { 
            SHOW_JITSI_WATERMARK: false,
            MOBILE_APP_PROMO: false
        }
    };

    try {
        // Gán vào biến meetingApi chung
        meetingApi = new JitsiMeetExternalAPI(domain, options);
        meetingApi.addEventListener('videoConferenceLeft', () => {
            window.endMeeting();
        });
    } catch (e) {
        console.error("Lỗi Jitsi:", e);
        window.endMeeting();
    }
};

// 3. Logic Họp Nhóm (Code CỦA BẠN - GIỮ NGUYÊN)
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
    
    // Thêm sự kiện để khi cúp máy thì tự thoát
    meetingApi.addEventListener('videoConferenceLeft', () => {
        window.endMeeting();
    });
};

// 4. Logic Kết thúc (Hợp nhất để xử lý cả 2 trường hợp)
window.endMeeting = () => { 
    if(meetingApi) {
        meetingApi.dispose(); 
        meetingApi = null;
    }
    
    // Logic thông minh: 
    // Nếu trước đó đang ở tab 'groups' (Họp nhóm) -> Về Groups
    // Nếu trước đó đang ở tab 'chat' (Gọi video) -> Về Chat
    // Mặc định ưu tiên về Chat nếu không xác định được
    
    // Kiểm tra xem user đang dùng tính năng nào dựa trên ID view hiện tại hoặc biến global
    // Tuy nhiên, để đơn giản và an toàn, ta sẽ check:
    
    if (currentChatType === 'group' && !currentChatTarget.startsWith('group_')) {
        // Nếu đang chat nhóm hoặc chat riêng -> Về Chat
        if(window.nav) window.nav('chat'); else window.handleNavReal('chat');
    } else {
        // Mặc định quay về Chat (vì Chat phổ biến hơn), 
        // hoặc bạn có thể đổi thành 'groups' nếu muốn ưu tiên nhóm như code cũ.
        if(window.nav) window.nav('chat'); else window.handleNavReal('chat');
    }
};
// ==========================================
// --- GEMINI AI CHAT SYSTEM (CONNECTED TO WORKER) ---
// ==========================================

// ⚠️ QUAN TRỌNG: Thay dòng dưới bằng link Cloudflare Worker của bạn
const WORKER_URL = "https://onthi2026.vutao27112k8t.workers.dev/"; 

// Biến toàn cục lưu trạng thái ảnh
let currentAIImageBase64 = null;
let currentMimeType = null;

// ================= 1. CÔNG NGHỆ NÉN ẢNH =================
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Resize về max 800px để gửi đi nhanh
                const MAX_SIZE = 800; 
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Nén JPEG chất lượng 0.7
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// ================= 2. XỬ LÝ CHỌN ẢNH =================
window.handleAIImageSelect = async function(input) {
    const file = input.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert("Vui lòng chỉ chọn file ảnh!");
        return;
    }

    try {
        const resizedBase64 = await compressImage(file);
        
        const imgDisplay = document.getElementById('ai-img-display');
        const previewBlock = document.getElementById('ai-image-preview');
        
        if(imgDisplay && previewBlock) {
            imgDisplay.src = resizedBase64;
            previewBlock.classList.remove('hidden');
        }
        
        // Lưu dữ liệu để gửi đi (bỏ prefix data:image...)
        currentAIImageBase64 = resizedBase64.split(',')[1]; 
        currentMimeType = 'image/jpeg';
        
    } catch (e) {
        console.error("Lỗi xử lý ảnh:", e);
        alert("Không thể đọc file ảnh này.");
    }
};

// ================= 3. XÓA ẢNH ĐANG CHỌN =================
window.removeAIImage = function() {
    const fileInput = document.getElementById('ai-image-input');
    const previewBlock = document.getElementById('ai-image-preview');
    const imgDisplay = document.getElementById('ai-img-display');

    if(fileInput) fileInput.value = ''; 
    if(previewBlock) previewBlock.classList.add('hidden');
    if(imgDisplay) imgDisplay.src = '';
    
    currentAIImageBase64 = null;
    currentMimeType = null;
};

// ================= 4. XỬ LÝ PHÍM ENTER =================
window.handleAIEnter = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.sendToGemini();
        e.target.style.height = 'auto';
    }
};

// ================= 5. GỬI TIN NHẮN (GỌI QUA WORKER) =================
window.sendToGemini = async function(isRetry = false) {
    // Kiểm tra cấu hình Worker URL
    if (!WORKER_URL || WORKER_URL.includes("ten-ban")) {
        alert("⚠️ Bạn chưa điền đúng link Cloudflare Worker trong code!");
        return;
    }

    const input = document.getElementById('ai-input');
    let text = input.value.trim();

    // --- LOGIC LẤY DỮ LIỆU ---
    if (!isRetry) {
        if (currentAIImageBase64 && !text) {
            text = "Hãy phân tích chi tiết hình ảnh này.";
        }

        if (!text && !currentAIImageBase64) {
            alert("Bạn chưa nhập nội dung!");
            return;
        }

        // Hiển thị tin nhắn User
        let displayImgSrc = null;
        if(currentAIImageBase64) {
            displayImgSrc = document.getElementById('ai-img-display').src;
        }
        appendAIMessage('user', text, displayImgSrc);
        
        window.lastRequest = { text, image: currentAIImageBase64, mime: currentMimeType };

        input.value = '';
        input.style.height = 'auto';
        window.removeAIImage();
    } else {
        text = window.lastRequest.text;
    }

    // Hiện Loading
    const loadingId = 'loading-' + Date.now();
    if (!isRetry) appendAILoading(loadingId);

    // --- ĐÓNG GÓI DỮ LIỆU ---
    const parts = [];
    const requestImage = isRetry ? window.lastRequest.image : (window.lastRequest?.image || currentAIImageBase64); 
    
    if (requestImage) {
        parts.push({
            inline_data: {
                mime_type: 'image/jpeg',
                data: requestImage
            }
        });
    }

    parts.push({ text: text });

    // Payload chuẩn gửi sang Worker (Worker sẽ đẩy tiếp sang Google)
    const payload = { contents: [{ parts: parts }] };

    try {
        // --- GỌI SANG CLOUDFLARE WORKER ---
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.status === 429 || response.status === 503) {
            const loadingElem = document.getElementById(loadingId);
            if(loadingElem) loadingElem.innerHTML = `<span class="text-orange-500 text-xs animate-pulse">⏳ Mạng bận, thử lại sau 5s...</span>`;
            await new Promise(r => setTimeout(r, 5000));
            if(loadingElem) loadingElem.remove();
            appendAILoading(loadingId);
            await window.sendToGemini(true);
            return;
        }

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || `Lỗi ${response.status}`);
        }

        const data = await response.json();
        const loadingFinal = document.getElementById(loadingId);
        if(loadingFinal) loadingFinal.remove();

        if (data.candidates && data.candidates[0].content) {
            const reply = data.candidates[0].content.parts[0].text;
            appendAIMessage('ai', reply);
        } else {
            appendAIMessage('ai', 'Không nhận được phản hồi từ AI.');
        }

    } catch (error) {
        const loadingElem = document.getElementById(loadingId);
        if(loadingElem) loadingElem.remove();
        console.error(error);
        appendAIMessage('ai', `⚠️ Lỗi: ${error.message}`);
    }
};

// ================= 6. HÀM UI: VẼ TIN NHẮN =================
function appendAIMessage(role, text, imgSrc = null) {
    const container = document.getElementById('ai-chat-messages');
    if(!container) return;

    const div = document.createElement('div');
    
    // Markdown parser
    let htmlContent = (typeof marked !== 'undefined') ? marked.parse(text) : text.replace(/\n/g, '<br>');

    if (role === 'user') {
        div.className = "flex items-end justify-end gap-2 animate-fade-in-up mb-4";
        let imgHtml = imgSrc ? `<img src="${imgSrc}" class="max-w-[200px] rounded-lg border border-white/20 mb-2 block ml-auto object-cover">` : '';
        div.innerHTML = `
            <div class="max-w-[85%] text-right">
                <div class="bg-blue-600 text-white p-3 rounded-2xl rounded-br-none shadow-md text-sm leading-relaxed inline-block text-left prose prose-invert max-w-none">
                    ${imgHtml}
                    <div>${htmlContent}</div>
                </div>
            </div>`;
    } else {
        div.className = "flex items-start gap-3 animate-fade-in-up mb-4";
        div.innerHTML = `
            <div class="bg-white border border-gray-200 w-8 h-8 rounded-full flex items-center justify-center text-purple-600 flex-shrink-0 shadow-sm mt-1">
                <i class="fas fa-robot"></i>
            </div>
            <div class="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-none shadow-sm max-w-[90%] text-gray-800 text-sm leading-relaxed prose max-w-none">
                ${htmlContent}
            </div>`;
    }
    
    container.appendChild(div);
    
    // Render công thức Toán (nếu có)
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(div, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
    }

    container.scrollTop = container.scrollHeight;
}

// ================= 7. HÀM UI: HIỆU ỨNG LOADING =================
function appendAILoading(id) {
    const container = document.getElementById('ai-chat-messages');
    if(!container) return;
    
    const div = document.createElement('div');
    div.id = id;
    div.className = "flex items-start gap-3 mb-4";
    div.innerHTML = `
        <div class="bg-white border border-gray-200 w-8 h-8 rounded-full flex items-center justify-center text-purple-600 flex-shrink-0 mt-1">
            <i class="fas fa-robot"></i>
        </div>
        <div class="bg-gray-100 p-3 rounded-2xl rounded-tl-none max-w-[100px] flex items-center gap-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0.4s"></div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ================= 8. TIỆN ÍCH KHÁC =================
setTimeout(() => {
    const aiInput = document.getElementById('ai-input');
    if(aiInput) aiInput.addEventListener('input', function() { 
        this.style.height = 'auto'; 
        this.style.height = (this.scrollHeight) + 'px'; 
    });
}, 1000);

window.clearAIChat = function() {
    if(confirm("Xóa toàn bộ đoạn chat?")) {
        document.getElementById('ai-chat-messages').innerHTML = '';
        window.removeAIImage();
    }

};
// ==========================================
// --- ADMIN FEATURES (MODIFIED) ---
// ==========================================
// --- ACTIVITY LOG SYSTEM ---

window.switchAdminTab = (tab) => {
    currentAdminTab = tab;
    document.getElementById('admin-tab-users').classList.toggle('hidden-section', tab !== 'users');
    document.getElementById('admin-tab-logs').classList.toggle('hidden-section', tab !== 'logs');
    if(tab === 'users') loadAdminStats(); else loadActivityLogs();
};

window.loadAdminStats = () => {
    getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory')).then(snap => {
        const tbody = document.getElementById('admin-user-list'); 
        tbody.innerHTML = '';
        
        snap.forEach(d => {
            const u = d.data();
            const isSelf = d.id === currentUser.uid;
            
            // 1. LOGIC TRẠNG THÁI (Giữ nguyên của bạn)
            let statusBadge = '';
            let actionBtn = '';
            if (u.status === 'pending') {
                statusBadge = '<span class="bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full text-[10px] font-bold animate-pulse">Chờ duyệt</span>';
                actionBtn = `<button onclick="approveUser('${d.id}')" class="text-white bg-green-500 hover:bg-green-600 font-bold mr-2 text-[10px] px-2 py-1 rounded shadow">DUYỆT</button>`;
            } else {
                statusBadge = '<span class="bg-green-100 text-green-700 px-2 py-1 rounded-full text-[10px] font-bold">Active</span>';
            }
            if (u.isBlocked) statusBadge = '<span class="bg-red-100 text-red-600 px-2 py-1 rounded-full text-[10px] font-bold">Đã khóa</span>';

            // 2. LOGIC HIỂN THỊ QUÀ TẶNG (Phần thêm mới)
            let spinInfo = '<span class="text-gray-400 text-[10px]">Chưa quay</span>';
            if (u.luckySpins && u.luckySpins.length > 0) {
                // Hiển thị danh sách quà tặng dạng nhãn nhỏ
                spinInfo = u.luckySpins.map(item => 
                    `<div class="bg-red-50 text-red-600 border border-red-100 rounded px-1 mb-1 text-[10px] font-medium">
                        <i class="fas fa-gift mr-1"></i>${item.gift}
                     </div>`
                ).join('');
            }

            // 3. NÚT RESET LƯỢT QUAY (Dành cho Admin)
            let resetSpinBtn = !isSelf ? 
                `<button onclick="resetUserSpin('${d.id}', '${u.displayName}')" class="text-[10px] bg-yellow-500 text-white p-1 rounded hover:bg-yellow-600 mr-1" title="Reset về 0 lượt quay">
                    <i class="fas fa-undo"></i>
                 </button>` : '';

            // 4. Các nút chức năng cũ
            let roleBtn = '';
            if (u.role === 'student') roleBtn = `<button onclick="assignLeader('${d.id}')" class="text-[10px] bg-blue-100 text-blue-600 p-1 rounded hover:bg-blue-200 mr-1">Thăng Leader</button>`;
            else if (u.role === 'leader') roleBtn = `<button onclick="demoteLeader('${d.id}')" class="text-[10px] bg-orange-100 text-orange-600 p-1 rounded hover:bg-orange-200 mr-1">Xuống Member</button>`;
            
            let deleteBtn = !isSelf ? `<button onclick="deleteUserSystem('${d.id}', '${u.displayName}')" class="text-[10px] bg-red-600 text-white p-1 rounded hover:bg-red-700"><i class="fas fa-trash"></i></button>` : '';

            // RENDER DÒNG BẢNG
            tbody.innerHTML += `
                <tr class="border-b hover:bg-gray-50 transition">
                    <td class="p-3">
                        <div class="font-bold text-sm">${u.displayName}</div>
                        <div class="text-[10px] text-gray-500">${u.email}</div>
                    </td>
                    <td class="p-3 text-xs"><span class="px-2 py-1 rounded bg-gray-100 font-medium">${u.role.toUpperCase()}</span></td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3">${spinInfo}</td> <td class="p-3 text-right whitespace-nowrap">
                        ${!isSelf ? `
                            <div class="flex justify-end items-center">
                                ${actionBtn}
                                ${resetSpinBtn}
                                <button onclick="toggleBlockUser('${d.id}', ${u.isBlocked})" class="text-[10px] bg-gray-200 p-1 rounded mr-1">${u.isBlocked?'Mở':'Khóa'}</button>
                                ${roleBtn} ${deleteBtn}
                            </div>
                        ` : '<span class="text-xs text-gray-400 font-italic">Admin System</span>'}
                    </td>
                </tr>`;
        });
    });
};

// Hàm bổ trợ Admin Reset lượt quay
window.resetUserSpin = async (uid, name) => {
    if(!confirm(`Bạn có chắc muốn xóa lịch sử và reset lượt quay cho ${name}?`)) return;
    try {
        // Xóa trong profile riêng
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'lucky_spin'), { count: 0, history: [] });
        // Xóa trong directory công khai
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { luckySpins: [] });
        
        toast(`Đã reset lượt quay cho ${name}`, "success");
        loadAdminStats(); // Tải lại bảng
    } catch(e) {
        toast("Lỗi: " + e.message, "error");
    }
};

// 5. Hàm duyệt user cho Admin
window.approveUser = async (uid) => {
    if(!confirm("Xác nhận đã nhận tiền và duyệt user này?")) return;
    try {
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', uid, 'profile', 'info'), { status: 'active' });
        await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', uid), { status: 'active' });
        toast("Đã duyệt thành công!", "success");
        loadAdminStats();
    } catch(e) { toast("Lỗi duyệt: " + e.message, "error"); }
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
// ==========================================
// --- LUCKY SPIN SYSTEM (2 SPINS MAX) ---
// ==========================================

let isWheelSpinning = false;
// Danh sách quà tặng: Thứ tự index 0 sẽ tương ứng với góc 0-45 độ trong CSS
const WHEEL_GIFTS = ["0","1", "2", "3", "4", "5", "6","7","8","9","10","11","12","13","14"];

function initWheelUI() {
    const container = document.getElementById('wheel-labels');
    if(!container) return;
    
    container.innerHTML = '';
    const giftCount = WHEEL_GIFTS.length;
    const angleStep = 360 / giftCount;

    WHEEL_GIFTS.forEach((gift, i) => {
        const label = document.createElement('div');
        label.className = 'wheel-label';
        
        // Căn chỉnh nhãn quà: i * bước góc + (bước góc / 2) để vào giữa nan quạt
        const rotation = i * angleStep + (angleStep / 2);
        label.style.transform = `rotate(${rotation}deg)`;
        
        label.innerHTML = `<span>${gift}</span>`;
        container.appendChild(label);
    });
}

// Gọi hàm ngay khi tải trang
document.addEventListener('DOMContentLoaded', initWheelUI);

// ==========================================
// --- LUCKY SPIN SYSTEM (1 SPIN MAX) ---
// ==========================================

// ... (Phần initWheelUI giữ nguyên không cần sửa) ...

window.spinWheel = async () => {
    if (isWheelSpinning) return;
    if (!currentUser) return toast("Vui lòng đăng nhập để quay!", "error");

    const spinDocRef = doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'profile', 'lucky_spin');
    
    try {
        const snap = await getDoc(spinDocRef);
        let spinData = snap.exists() ? snap.data() : { count: 0, history: [] };

        // --- SỬA Ở ĐÂY ---
        // Trước đây là (> 1) cho 2 lượt. Giờ sửa thành (>= 1) để chặn ngay khi đã quay 1 lần.
        if (spinData.count >= 1) { 
            toast("Vòng quay sẽ được mở trong thời gian quy định bắt đầu từ ngày 08/02/2026", "error");
            document.getElementById('spin-result').innerText = "Hết lượt quay!";
            return;
        }
        // ----------------

        isWheelSpinning = true;
        const wheelInner = document.getElementById('lucky-wheel-inner');
        const btnSpin = document.getElementById('btn-spin-action');
        
        const giftCount = WHEEL_GIFTS.length;
        const segmentDegree = 360 / giftCount;
        const randomIndex = Math.floor(Math.random() * giftCount);
        
        // Logic quay giữ nguyên
        const extraSpins = 3600; 
        const giftAngle = randomIndex * segmentDegree + (segmentDegree / 2);
        const finalRotation = extraSpins - giftAngle - 90; 

        wheelInner.style.transition = "transform 4s cubic-bezier(0.15, 0, 0.15, 1)";
        wheelInner.style.transform = `rotate(${finalRotation}deg)`;
        if(btnSpin) btnSpin.disabled = true;

        setTimeout(async () => {
            const giftReceived = WHEEL_GIFTS[randomIndex];
            
            const currentHistory = spinData.history || [];
            const newHistoryItem = {
                gift: giftReceived,
                time: new Date().toLocaleString('vi-VN'),
                ts: Date.now()
            };
            const updatedHistory = [...currentHistory, newHistoryItem];

            // Lưu dữ liệu vào Firebase
            await setDoc(spinDocRef, {
                count: spinData.count + 1, // Count sẽ tăng từ 0 lên 1
                history: updatedHistory
            }, { merge: true });

            const publicUserRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid);
            await updateDoc(publicUserRef, {
                luckySpins: updatedHistory
            });

            const resultEl = document.getElementById('spin-result');
            if(resultEl) resultEl.innerText = `Chúc mừng: ${giftReceived}!`;
            toast(`Bạn nhận được: ${giftReceived}`, "success");
            
            isWheelSpinning = false;
            // Nút quay vẫn disable hoặc enable tùy bạn, nhưng logic ở trên đã chặn nếu bấm lại
            if(btnSpin) btnSpin.disabled = false; 
            
        }, 4000);

    } catch (e) {
        console.error("Spin error:", e);
        toast("Có lỗi xảy ra, vui lòng thử lại!", "error");
        isWheelSpinning = false;
    }
};
// ==========================================
// --- GAME LOGIC SYSTEM (FINAL FIXED) ---
// ==========================================

// 1. Biến quản lý toàn cục
let activeGameInterval = null;
let currentGameName = "Game"; 

// 2. Hàm dọn dẹp game (Dừng vòng lặp & sự kiện)
function clearActiveGame() {
    if (activeGameInterval) {
        clearInterval(activeGameInterval);
        activeGameInterval = null;
    }
    document.onkeydown = null; // Gỡ bỏ sự kiện bàn phím
}

// 3. Hàm Xử lý KẾT THÚC GAME (Đã sửa lỗi crash)
window.handleGameOver = async (score, gameName = currentGameName) => {
    // Dọn dẹp lần cuối
    clearActiveGame();

    // Dùng setTimeout để UI hiển thị số 0s trước khi hiện popup alert
    setTimeout(async () => {
        alert(`KẾT THÚC GAME: ${gameName}\nĐiểm số của bạn: ${score}`);
        
        // Đóng giao diện game
        window.closeGame();

        // Lưu điểm vào Database (Chỉ lưu nếu có điểm)
        if (score > 0 && currentUser) {
            try {
                // Cộng dồn điểm vào profile
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid);
                const userSnap = await getDoc(userRef);
                
                if (userSnap.exists()) {
                    const currentScore = userSnap.data().totalScore || 0;
                    const newTotal = currentScore + score;

                    await updateDoc(userRef, { 
                        totalScore: newTotal,
                        lastGamePlayed: serverTimestamp()
                    });
                    
                    // Cập nhật profile gốc
                    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'profile', 'info'), { 
                        totalScore: newTotal 
                    });

                    // Ghi Nhật Ký Hoạt Động (Nếu có hàm log)
                    if (typeof logActivity === 'function') {
                        logActivity('CHƠI GAME', gameName, `Đạt ${score} điểm`);
                    }
                    
                    // Thông báo nhỏ
                    if(typeof toast === 'function') toast(`+${score} điểm tích lũy!`, 'success');
                }
            } catch (e) {
                console.error("Lỗi lưu điểm:", e);
            }
        }
    }, 100);
};

// 4. Hàm trung gian để gọi Game Over từ các game con
window.finishActiveGame = (score) => {
    clearActiveGame(); // Dừng ngay lập tức
    window.handleGameOver(score, currentGameName);
};

// 5. Hàm Bắt đầu Game (Chỉ còn 3 game: Né, Toán, Lật hình)
window.startGame = (gameType) => {
    const modal = document.getElementById('modal-game-play');
    const container = document.getElementById('game-canvas-container');
    const mobileControls = document.getElementById('snake-mobile-controls');
    const titleDisplay = document.getElementById('game-title-play');
    
    // Reset giao diện
    modal.classList.remove('hidden');
    container.innerHTML = '';
    document.getElementById('game-score-play').innerText = "Score: 0";

    // Ẩn controls mobile cũ
    if(mobileControls) mobileControls.classList.add('hidden');

    clearActiveGame(); 

    // Routing chọn game
    if (gameType === 'snake') { 
        currentGameName = "Né Thiên Thạch";
        if(titleDisplay) titleDisplay.innerText = "NÉ THIÊN THẠCH";
        initDodgeGame(container); 
    } 
    else if (gameType === 'math') {
        currentGameName = "Vua Toán Học";
        if(titleDisplay) titleDisplay.innerText = "VUA TOÁN HỌC";
        initMathGame(container); 
    }
    else if (gameType === 'memory') {
        currentGameName = "Lật Hình";
        if(titleDisplay) titleDisplay.innerText = "LẬT HÌNH";
        initMemoryGame(container); 
    }
};

// 6. Hàm Đóng Game
window.closeGame = () => {
    clearActiveGame();
    document.getElementById('modal-game-play').classList.add('hidden');
    const mobileControls = document.getElementById('snake-mobile-controls');
    if(mobileControls) mobileControls.classList.add('hidden');
};

// Placeholder tránh lỗi
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
    let localGameOver = false;

    const moveLeft = () => { if (player.x > 0 && !localGameOver) player.x -= 50; };
    const moveRight = () => { if (player.x < 260 && !localGameOver) player.x += 50; };

    document.onkeydown = (e) => {
        if (e.key === 'ArrowLeft') moveLeft();
        if (e.key === 'ArrowRight') moveRight();
    };

    document.getElementById('btn-dodge-left').onclick = (e) => { e.preventDefault(); moveLeft(); };
    document.getElementById('btn-dodge-right').onclick = (e) => { e.preventDefault(); moveRight(); };

    activeGameInterval = setInterval(() => {
        if (localGameOver) return;
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

        // Vẽ Player
        ctx.fillStyle = player.color;
        ctx.shadowBlur = 15; ctx.shadowColor = player.color;
        ctx.fillRect(player.x, player.y, player.w, player.h);
        ctx.shadowBlur = 0;

        // Vẽ Enemy
        for (let i = 0; i < enemies.length; i++) {
            let e = enemies[i];
            e.y += 4 + Math.floor(score / 200);

            ctx.fillStyle = e.color;
            ctx.fillRect(e.x, e.y, e.w, e.h);

            // Va chạm
            if (player.x < e.x + e.w && player.x + player.w > e.x &&
                player.y < e.y + e.h && player.y + player.h > e.y) {
                
                if (e.type === 'danger') {
                    hp--;
                    document.getElementById('dodge-hp').innerText = hp;
                    canvas.classList.add('opacity-50'); 
                    setTimeout(()=>canvas.classList.remove('opacity-50'), 100);
                    
                    if (hp <= 0) {
                        localGameOver = true;
                        window.finishActiveGame(score); 
                        return;
                    }
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
}

// ==========================================
// --- GAME 2: MATH (VUA TOÁN HỌC) ---
// ==========================================
function initMathGame(container) {
    container.innerHTML = `
        <div class="text-white text-center w-full">
            <div id="math-q" class="text-5xl font-bold mb-8">Ready?</div>
            <input type="number" id="math-ans" class="text-black p-3 rounded text-center text-2xl w-32 focus:outline-none" autofocus placeholder="?">
            <button id="btn-math-submit" class="block w-full bg-blue-500 mt-6 p-3 rounded font-bold hover:bg-blue-600 transition">Trả lời</button>
            <div id="math-timer" class="mt-4 text-red-400 font-mono text-xl">Time: 30s</div>
        </div>
    `;
    
    let score = 0, timeLeft = 30, a, b, res;
    
    const nextQ = () => {
        a = Math.floor(Math.random() * 20) + 1;
        b = Math.floor(Math.random() * 20) + 1;
        res = a + b;
        document.getElementById('math-q').innerText = `${a} + ${b} = ?`;
        const input = document.getElementById('math-ans');
        input.value = '';
        input.focus();
    };
    
    const check = () => {
        const val = parseInt(document.getElementById('math-ans').value);
        if (val === res) {
            score += 10;
            document.getElementById('game-score-play').innerText = `Score: ${score}`;
            nextQ();
        } else {
            // Hiệu ứng sai
            document.getElementById('math-ans').classList.add('bg-red-200');
            setTimeout(() => document.getElementById('math-ans').classList.remove('bg-red-200'), 200);
        }
    };
    
    document.getElementById('btn-math-submit').onclick = check;
    document.getElementById('math-ans').onkeydown = (e) => { if(e.key === 'Enter') check(); };

    nextQ();
    
    // --- TIMER FIX ---
    activeGameInterval = setInterval(() => {
        timeLeft--;
        const tElem = document.getElementById('math-timer');
        if(tElem) tElem.innerText = `Time: ${timeLeft}s`;
        
        if (timeLeft <= 0) {
            // Dừng interval ngay lập tức
            clearInterval(activeGameInterval);
            activeGameInterval = null;
            // Gọi kết thúc
            window.finishActiveGame(score);
        }
    }, 1000);
}

// ==========================================
// --- GAME 3: MEMORY (LẬT HÌNH) ---
// ==========================================
function initMemoryGame(container) {
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
            
            // Lật thẻ
            card.classList.remove('bg-blue-200');
            card.classList.add('bg-white', 'border-2', 'border-blue-500');
            card.querySelector('span').classList.remove('opacity-0');
            
            flipped.push({ card, icon });
            
            if (flipped.length === 2) {
                if (flipped[0].icon === flipped[1].icon) {
                    // Đúng cặp
                    matched++;
                    score += 20;
                    document.getElementById('game-score-play').innerText = `Score: ${score}`;
                    flipped = [];
                    
                    if (matched === icons.length) {
                        setTimeout(() => {
                            window.finishActiveGame(score); 
                        }, 500);
                    }
                } else {
                    // Sai cặp
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
window.loadActivityLogs = () => {
    // Lấy 50 hành động mới nhất
    onSnapshot(query(collection(db, 'artifacts', APP_ID, 'private', 'logs', 'activity'), orderBy('ts', 'desc'), limit(50)), snap => {
        const tbody = document.getElementById('admin-log-list');
        if (!tbody) return;
        
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-gray-500">Chưa có dữ liệu hoạt động.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        snap.forEach(d => {
            const l = d.data();
            const timeStr = l.ts ? new Date(l.ts.toDate()).toLocaleString('vi-VN') : 'Vừa xong';
            
            // Tạo màu badge cho loại hành động
            let badgeColor = 'bg-gray-100 text-gray-600';
            if(l.action.includes('VIDEO')) badgeColor = 'bg-blue-100 text-blue-600';
            if(l.action.includes('GAME')) badgeColor = 'bg-purple-100 text-purple-600';
            if(l.action.includes('ĐỀ') || l.action.includes('THI')) badgeColor = 'bg-red-100 text-red-600';

            tbody.innerHTML += `
                <tr class="border-b text-sm hover:bg-gray-50 transition">
                    <td class="p-3 text-gray-500 whitespace-nowrap text-xs">${timeStr}</td>
                    
                    <td class="p-3">
                        <div class="font-bold text-gray-800">${l.userName}</div>
                        <div class="text-[10px] text-gray-400">${l.email}</div>
                    </td>
                    
                    <td class="p-3">
                        <span class="${badgeColor} px-2 py-1 rounded text-[10px] font-bold mr-2">${l.action}</span>
                        <span class="font-medium text-gray-700">${l.name}</span>
                    </td>
                    
                    <td class="p-3 text-gray-600 font-mono text-xs">${l.details}</td>
                </tr>`;
        });
    });
};
// ==========================================
// --- 1. DATA LOADER & LINK PROCESSOR ---
// ==========================================
let currentVideoTitle = ''; // Biến lưu tên video đang xem
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1FBbveBD1RpIAN3-Tc5gE2Iy0UHgEFMWNfF7qrU8gjlM/export?format=csv';

let mockSubjectData = {
    'Toán': { videos: [], docs: [], exams: [] },
    'Lý':   { videos: [], docs: [], exams: [] },
    'Hóa':  { videos: [], docs: [], exams: [] },
    'Văn':  { videos: [], docs: [], exams: [] },
    'Anh':  { videos: [], docs: [], exams: [] },
    'default': { videos: [], docs: [], exams: [] }
};

// Hàm làm sạch chuỗi
function cleanText(txt) {
    if (!txt) return '';
    return txt.trim().replace(/^"|"$/g, '');
}

// Hàm sửa link Google Drive (FIX LỖI CSP BLOCKED)
function fixDriveLink(url) {
    if (!url) return '';
    url = url.trim();
    if (url.includes('drive.google.com')) {
        if (url.includes('/preview')) return url;
        return url.replace(/\/view.*/, '/preview')
                  .replace(/\/edit.*/, '/preview')
                  .replace(/\/open.*/, '/preview');
    }
    return url;
}

// Hàm phân loại Video (FIX LỖI 404 & EMBED)
function processVideoLink(url) {
    if (!url) return { type: 'other', src: '' };
    url = url.trim();

    // 1. ID YouTube (11 ký tự)
    const ytIdRegex = /^[a-zA-Z0-9_-]{11}$/;
    if (ytIdRegex.test(url)) return { type: 'youtube', src: url };

    // 2. Link YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        const id = (match && match[2].length === 11) ? match[2] : null;
        return { type: 'youtube', src: id || url };
    }

    // 3. Facebook
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&t=0`;
        return { type: 'facebook', src: embedUrl };
    }

   // 4. TikTok (NÂNG CẤP)
    if (url.includes('tiktok.com')) {
        // Regex tìm ID: Tìm chuỗi số dài sau /video/ hoặc /v/
        // Hỗ trợ link dạng: tiktok.com/@user/video/723456... hoặc tiktok.com/v/723456...
        const idMatch = url.match(/(?:video|v)\/([0-9]+)/);
        
        if (idMatch && idMatch[1]) {
            // Dùng link embed v2 chuẩn của TikTok + ngôn ngữ tiếng Việt
            return { type: 'tiktok', src: `https://www.tiktok.com/embed/v2/${idMatch[1]}?lang=vi-VN` };
        }
        
        // Nếu không lấy được ID (ví dụ link rút gọn vt.tiktok.com), trả về link gốc (có thể lỗi nhưng đỡ hơn 404)
        console.warn("Không lấy được ID TikTok, dùng link gốc:", url);
        return { type: 'tiktok', src: url };
    }

    return { type: 'other', src: url };
}
window.handleNavReal = (viewId) => {
    // 1. Ẩn tất cả các màn hình (view)
    document.querySelectorAll('#content-container > div').forEach(d => d.classList.add('hidden-section'));
    
    // 2. Hiện màn hình được chọn
    if (viewId === 'ai-chat') {
        document.getElementById('view-ai-chat').classList.remove('hidden-section');
    } else if (viewId === 'hsa') {
        document.getElementById('view-hsa').classList.remove('hidden-section');
    } else {
        const target = document.getElementById(`view-${viewId}`);
        if(target) target.classList.remove('hidden-section');
    }

    // 3. Tải dữ liệu tương ứng
    if (viewId === 'groups') loadGroups();
    if (viewId === 'admin') loadAdminStats();
    if (viewId === 'games') loadLeaderboard();
    if (viewId === 'dashboard') {
        // Mặc định load Top Video
        loadLearningLeaderboard('video'); 
    }
    // 4. Reset Chat title nếu cần
    if (viewId === 'chat') {
        if (!currentChatTarget) switchChatTab('global');
    }

    // --- MỚI THÊM: GHI LOG ---
    // Mapping tên tiếng Việt cho đẹp
    const mapNames = {
        'dashboard': 'Trang chủ', 'subjects': 'Kho Môn Học', 'groups': 'Nhóm Học Tập',
        'chat': 'Chat/Nhắn tin', 'ai-chat': 'Trợ lý AI', 'games': 'Khu Giải Trí',
        'lucky-spin': 'Vòng Quay', 'cinema': 'Rạp Phim', 'hsa': 'Luyện thi HSA/TSA'
    };
    logActivity('TRUY CẬP', mapNames[viewId] || viewId, 'Mở tab hệ thống');
};
// --- HỆ THỐNG GHI LOG & THỐNG KÊ HỌC TẬP (PHIÊN BẢN CUỐI CÙNG) ---
async function logActivity(actionType, contentName, detailInfo) {
    if (!currentUser) return;

    // 1. Ghi log chi tiết (để Admin đọc)
    const logRef = collection(db, 'artifacts', APP_ID, 'private', 'logs', 'activity');
    try {
        await addDoc(logRef, {
            uid: currentUser.uid,
            userName: userProfile.displayName || "User",
            email: userProfile.email,
            ts: serverTimestamp(),
            action: actionType,
            name: contentName,
            details: detailInfo
        });

        // 2. CẬP NHẬT THỐNG KÊ CHO BẢNG XẾP HẠNG (để hiện ngoài Dashboard)
        const userPublicRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid);
        
        // Nếu là xem Video -> Tăng biến studyStats.videoCount
        if (actionType === 'XEM VIDEO' || actionType.includes('VIDEO')) {
            await updateDoc(userPublicRef, {
                "studyStats.videoCount": increment(1),
                "studyStats.lastActive": serverTimestamp()
            });
        }
        // Nếu là làm Đề/Tài liệu -> Tăng biến studyStats.examCount
        else if (actionType === 'TÀI LIỆU' || actionType.includes('ĐỀ')) {
            await updateDoc(userPublicRef, {
                "studyStats.examCount": increment(1),
                "studyStats.lastActive": serverTimestamp()
            });
        }

    } catch (e) {
        console.error("Lỗi ghi log/thống kê:", e);
    }
}
async function loadDataFromSheet() {
    try {
        console.log("Đang tải dữ liệu từ Sheet...");
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        const text = await response.text();
        const rows = text.split('\n').slice(1);

        // Reset data
        mockSubjectData = {
            'Toán': { videos: [], docs: [], exams: [] },
            'Lý':   { videos: [], docs: [], exams: [] },
            'Hóa':  { videos: [], docs: [], exams: [] },
            'Văn':  { videos: [], docs: [], exams: [] },
            'Anh':  { videos: [], docs: [], exams: [] },
            'HSA':  { videos: [], docs: [], exams: [] },
            'TSA':  { videos: [], docs: [], exams: [] },
            'default': { videos: [], docs: [], exams: [] }
        };

        rows.forEach(row => {
            const cols = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            if (cols.length < 1) return;

            const subjectName = cleanText(cols[0]); 
            if (!subjectName) return; 
            const target = mockSubjectData[subjectName] ? subjectName : 'default';

            // Xử lý Video
            const vidName = cleanText(cols[1]);
            const vidRaw = cleanText(cols[2]);
            if (vidName && vidRaw) {
                const vidObj = processVideoLink(vidRaw);
                mockSubjectData[target].videos.push({ t: vidName, data: vidObj });
            }

            // Xử lý Tài liệu
            const docName = cleanText(cols[3]);
            const docLink = fixDriveLink(cleanText(cols[4]));
            if (docName && docLink) mockSubjectData[target].docs.push({ t: docName, url: docLink });

            // Xử lý Đề thi
            const examName = cleanText(cols[5]);
            const examLink = fixDriveLink(cleanText(cols[6]));
            if (examName && examLink) mockSubjectData[target].exams.push({ t: examName, url: examLink });
        });

        if(typeof toast === 'function') toast('Dữ liệu đã cập nhật!', 'success');
        console.log("Data Loaded:", mockSubjectData);

    } catch (error) { console.error("Lỗi tải data:", error); }
}

// Gọi hàm tải ngay lập tức
loadDataFromSheet();


// ==========================================
// --- 2. GIAO DIỆN HIỂN THỊ (OPEN SUBJECT) ---
// ==========================================

window.openSubject = (subj) => {
    const data = mockSubjectData[subj] || mockSubjectData['default'];
    
    // Cập nhật tiêu đề
    const titleEl = document.getElementById('detail-subject-title');
    if(titleEl) titleEl.innerText = `Môn ${subj}`;

    // --- RENDER VIDEO ---
    const videoContainer = document.getElementById('subj-content-video');
    if (videoContainer) {
        if (data.videos.length > 0) {
            videoContainer.innerHTML = data.videos.map((v, i) => {
                const type = v.data ? v.data.type : 'youtube';
                const src = v.data ? v.data.src : v.id; // Fallback cho data cũ
                
                let icon = '<i class="fas fa-play"></i>';
                let colorClass = 'bg-red-100 text-red-600';
                
                if (type === 'facebook') { icon = '<i class="fab fa-facebook-f"></i>'; colorClass = 'bg-blue-100 text-blue-600'; }
                else if (type === 'tiktok') { icon = '<i class="fab fa-tiktok"></i>'; colorClass = 'bg-gray-900 text-white'; }

                return `
                <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center transform hover:scale-[1.01] transition border border-gray-100">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <div class="${colorClass} w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">${icon}</div>
                        <div class="flex flex-col overflow-hidden">
                            <span class="font-bold text-sm text-gray-700 truncate">${v.t}</span>
                            <span class="text-[10px] text-gray-400 uppercase tracking-wider">${type}</span>
                        </div>
                    </div>
                    <button onclick="playUniversalVideo('${type}', '${src}', '${v.t.replace(/'/g, "\\'")}')" class="bg-indigo-600 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-indigo-700 shadow active:scale-95 transition">Xem</button>
                </div>`;
            }).join('');
        } else {
            videoContainer.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-video text-4xl mb-2"></i><p>Chưa có video.</p></div>';
        }
    }

    // --- RENDER TÀI LIỆU ---
    const docContainer = document.getElementById('subj-content-doc');
    if (docContainer) {
        docContainer.innerHTML = data.docs.length > 0 ? data.docs.map(d => `
            <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center border-l-4 border-blue-500 hover:shadow-md transition cursor-pointer" onclick="openEmbedModal('${d.url}', '${d.t}')">
                <div class="flex items-center gap-3 overflow-hidden">
                    <i class="fas fa-file-pdf text-blue-500 text-xl"></i>
                    <span class="font-bold text-sm truncate text-gray-700">${d.t}</span>
                </div>
                <button class="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded text-xs font-bold"><i class="fas fa-eye"></i> Xem</button>
            </div>
        `).join('') : '<div class="text-center py-10 text-gray-400"><i class="fas fa-folder-open text-4xl mb-2"></i><p>Chưa có tài liệu.</p></div>';
    }

    // --- RENDER ĐỀ THI ---
    const examContainer = document.getElementById('subj-content-exam');
    if (examContainer) {
        examContainer.innerHTML = data.exams.length > 0 ? data.exams.map(e => `
            <div class="bg-white p-4 mb-2 rounded shadow flex justify-between items-center border-l-4 border-purple-500 hover:shadow-md transition cursor-pointer" onclick="openEmbedModal('${e.url}', '${e.t}')">
                <div class="flex items-center gap-3 overflow-hidden">
                    <i class="fas fa-edit text-purple-500 text-xl"></i>
                    <span class="font-bold text-sm truncate text-gray-700">${e.t}</span>
                </div>
                <button class="text-purple-600 bg-purple-50 hover:bg-purple-100 px-3 py-1 rounded text-xs font-bold"><i class="fas fa-pen"></i> Làm</button>
            </div>
        `).join('') : '<div class="text-center py-10 text-gray-400"><i class="fas fa-scroll text-4xl mb-2"></i><p>Chưa có đề thi.</p></div>';
    }

    if(typeof switchSubjectTab === 'function') switchSubjectTab('video');
    if(typeof window.handleNavReal === 'function') window.handleNavReal('subject-detail');
};


// ==========================================
// --- 3. VIDEO PLAYER & MODAL UTILS ---
// ==========================================

// Hàm chuyển Tab
window.switchSubjectTab = (tab) => {
    ['video', 'doc', 'exam'].forEach(t => {
        const btn = document.getElementById(`tab-subj-${t}`);
        const content = document.getElementById(`subj-content-${t}`);
        if(content && btn) {
            if(t === tab) { 
                btn.className = "flex-1 py-3 font-bold border-b-2 border-indigo-600 text-indigo-600 bg-indigo-50 transition min-w-[100px] whitespace-nowrap"; 
                content.classList.remove('hidden-section'); 
            } else { 
                btn.className = "flex-1 py-3 font-bold text-gray-500 hover:text-indigo-600 hover:bg-gray-50 transition min-w-[100px] whitespace-nowrap"; 
                content.classList.add('hidden-section'); 
            }
        }
    });
};

window.openEmbedModal = (url, title) => {
    document.getElementById('embed-title').innerText = title;
    document.getElementById('embed-frame').src = url;
    document.getElementById('embed-modal').classList.remove('hidden');

    // --- MỚI THÊM ---
    // Phân biệt là Đề thi hay Tài liệu dựa vào context hoặc URL
    // Ở đây ta gọi chung là "TÀI LIỆU/ĐỀ"
    logActivity('XEM TÀI LIỆU', title, 'Đã mở xem/làm bài');
};
window.closeEmbedModal = () => {
    document.getElementById('embed-modal').classList.add('hidden');
    document.getElementById('embed-frame').src = '';
};

// Hàm phát Video Đa Năng (MỚI)
window.playUniversalVideo = (type, src) => {
    const modal = document.getElementById('video-modal');
    const ytContainer = document.getElementById('youtube-player');
    const genericFrame = document.getElementById('generic-player');
    const ytControls = document.getElementById('yt-controls');

    if(!modal) return;
    modal.classList.remove('hidden');

    // Reset
    if (genericFrame) genericFrame.src = ''; 
    if (player && typeof player.stopVideo === 'function') player.stopVideo();

    if (type === 'youtube') {
        // --- CHẾ ĐỘ YOUTUBE ---
        if(ytContainer) ytContainer.classList.remove('hidden');
        if(genericFrame) genericFrame.classList.add('hidden');
        if(ytControls) ytControls.classList.remove('hidden');

        if (player) {
            player.loadVideoById(src);
        } else {
            if (window.YT && window.YT.Player) {
                player = new YT.Player('youtube-player', {
                    height: '100%', width: '100%', videoId: src,
                    playerVars: { 'controls': 0, 'disablekb': 1, 'fs': 0, 'modestbranding': 1, 'rel': 0 },
                    events: { 'onStateChange': onPlayerStateChange }
                });
            }
        }
    } else {
        // --- CHẾ ĐỘ FACEBOOK / TIKTOK ---
        if(ytContainer) ytContainer.classList.add('hidden');
        if(ytControls) ytControls.classList.add('hidden');
        
        if(genericFrame) {
            genericFrame.classList.remove('hidden');
            if (src && src.includes('http')) {
                genericFrame.src = src;
            } else {
                console.warn("Link video iframe không hợp lệ:", src);
            }
        }
    }
};

// Hàm cầu nối cho code cũ (CHỐNG LỖI NOT DEFINED)
window.playVideo = (id) => {
    console.log("Redirecting legacy playVideo call...");
    window.playUniversalVideo('youtube', id);
};

window.closeVideoModal = () => {
    document.getElementById('video-modal').classList.add('hidden');
    
    // --- MỚI THÊM: Tính % và Ghi Log ---
    if (player && typeof player.getDuration === 'function' && typeof player.getCurrentTime === 'function') {
        const dur = player.getDuration();
        const cur = player.getCurrentTime();
        if (dur > 0) {
            const percent = Math.round((cur / dur) * 100);
            // Chỉ log nếu xem > 5% để tránh spam
            if (percent > 5) {
                logActivity('XEM VIDEO', currentVideoTitle, `Đã xem: ${percent}%`);
            }
        }
    } else {
        // Trường hợp video TikTok/Facebook (không lấy được API time)
        logActivity('XEM VIDEO', currentVideoTitle, 'Đã mở xem (Embed)');
    }
    // ------------------------------------

    if(player && typeof player.stopVideo === 'function') player.stopVideo();
    
    const genericFrame = document.getElementById('generic-player');
    if(genericFrame) genericFrame.src = '';
    
    if(videoTimer) clearInterval(videoTimer);
};

// Sự kiện Player Youtube
function onPlayerStateChange(event) { 
    if (event.data == YT.PlayerState.PLAYING) videoTimer = setInterval(strictVideoLoop, 1000); 
    else clearInterval(videoTimer); 
}

function strictVideoLoop() { 
    if(!player || !player.getDuration) return; 
    const cur = player.getCurrentTime(), dur = player.getDuration();
    if(dur > 0) {
        const per = (cur/dur)*100; 
        const bar = document.getElementById('video-bar');
        const txtPer = document.getElementById('video-percent');
        const txtTime = document.getElementById('video-time');
        
        if(bar) bar.style.width = per + '%'; 
        if(txtPer) txtPer.innerText = Math.round(per) + '%'; 
        
        const m = Math.floor(cur/60), s = Math.floor(cur%60); 
        if(txtTime) txtTime.innerText = `${m}:${s<10?'0'+s:s}`; 
    }
    if (player.isMuted()) player.unMute(); 
}
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
/// Hàm tải BXH Chăm Chỉ (Dashboard)
window.loadLearningLeaderboard = async (type = 'video') => {
    const container = document.getElementById('dashboard-leaderboard-list');
    const btnVideo = document.getElementById('tab-rank-video');
    const btnExam = document.getElementById('tab-rank-exam');
    
    if (!container) return;

    // Cập nhật UI Tabs
    if (type === 'video') {
        btnVideo.className = "px-3 py-1 text-xs font-bold rounded-md transition bg-white text-blue-600 shadow-sm";
        btnExam.className = "px-3 py-1 text-xs font-bold rounded-md transition text-gray-500 hover:text-purple-600";
    } else {
        btnVideo.className = "px-3 py-1 text-xs font-bold rounded-md transition text-gray-500 hover:text-blue-600";
        btnExam.className = "px-3 py-1 text-xs font-bold rounded-md transition bg-white text-purple-600 shadow-sm";
    }

    container.innerHTML = '<div class="text-center text-xs text-gray-400 py-4"><i class="fas fa-spinner fa-spin"></i> Đang tải...</div>';

    try {
        // Lấy danh sách user
        const q = query(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory'), limit(50));
        const snap = await getDocs(q);
        
        let users = [];
        snap.forEach(d => {
            const u = d.data();
            // Lấy dữ liệu thống kê (nếu chưa có thì là 0)
            const stats = u.studyStats || { videoCount: 0, examCount: 0 };
            
            // Chọn chỉ số dựa trên Tab
            const count = type === 'video' ? (stats.videoCount || 0) : (stats.examCount || 0);
            
            if (count > 0) {
                users.push({ ...u, scoreDisplay: count });
            }
        });

        // Sắp xếp: Cao xuống thấp
        users.sort((a, b) => b.scoreDisplay - a.scoreDisplay);
        
        // Lấy Top 5
        const top5 = users.slice(0, 5);

        if (top5.length === 0) {
            container.innerHTML = `
                <div class="text-center text-xs text-gray-400 py-4">
                    <i class="fas fa-ghost text-xl mb-1"></i><br>
                    Chưa ai ${type === 'video' ? 'xem video' : 'làm đề'} nào.
                </div>`;
            return;
        }

        // Render
        const themeColor = type === 'video' ? 'text-blue-600' : 'text-purple-600';
        const unitText = type === 'video' ? 'bài' : 'đề';

        container.innerHTML = top5.map((u, i) => {
            let rankStyle = "bg-gray-100 text-gray-500";
            let rowEffect = "";
            
            if (i === 0) { rankStyle = "bg-yellow-100 text-yellow-600"; rowEffect = "border-l-2 border-yellow-400 bg-yellow-50/30"; }
            else if (i === 1) rankStyle = "bg-gray-200 text-gray-600";
            else if (i === 2) rankStyle = "bg-orange-100 text-orange-600";

            return `
                <div class="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition ${rowEffect}">
                    <div class="flex items-center gap-3 overflow-hidden">
                        <div class="w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0 ${rankStyle}">
                            ${i + 1}
                        </div>
                        <img src="${u.avatar}" class="w-8 h-8 rounded-full border border-gray-100 bg-gray-200 object-cover shrink-0">
                        <div class="flex flex-col overflow-hidden">
                            <span class="font-bold text-sm text-gray-800 truncate">${u.displayName}</span>
                            <span class="text-[10px] text-gray-500 truncate">
                                ${type === 'video' ? 'Chăm chỉ xem bài' : 'Siêu luyện đề'}
                            </span>
                        </div>
                    </div>
                    <div class="font-bold ${themeColor} text-sm whitespace-nowrap">
                        ${u.scoreDisplay} <span class="text-[10px] font-normal text-gray-400">${unitText}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-center text-xs text-red-400">Lỗi tải bảng xếp hạng.</p>';
    }
};
// --- SỬA LỖI GAME OVER (Thay thế hàm cũ đang bị lỗi) ---
window.handleGameOver = async (score, gameName = currentGameName) => {
    // 1. Dọn dẹp game
    // Hàm clearActiveGame() đã xử lý việc tắt bàn phím (document.onkeydown = null)
    // NÊN KHÔNG CẦN gọi removeEventListener cho handleSnakeKey nữa (xóa dòng gây lỗi đó đi)
    clearActiveGame();

    // 2. Hiển thị thông báo và đóng game
    // Dùng setTimeout để UI kịp cập nhật số 0s trước khi hiện Alert
    setTimeout(async () => {
        alert(`KẾT THÚC GAME: ${gameName}\nĐiểm số của bạn: ${score}`);
        
        window.closeGame();

        // 3. Lưu điểm vào Firebase (Chỉ lưu nếu có điểm và đã đăng nhập)
        if (score > 0 && currentUser) {
            try {
                // Cập nhật điểm công khai
                const publicRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users_directory', currentUser.uid);
                const userSnap = await getDoc(publicRef);
                
                if (userSnap.exists()) {
                    const currentScore = userSnap.data().totalScore || 0;
                    const newTotal = currentScore + score;

                    await updateDoc(publicRef, { 
                        totalScore: newTotal,
                        lastGamePlayed: serverTimestamp()
                    });
                    
                    // Cập nhật profile cá nhân
                    await updateDoc(doc(db, 'artifacts', APP_ID, 'users', currentUser.uid, 'profile', 'info'), { 
                        totalScore: newTotal 
                    });

                    // Ghi log hoạt động
                    if (typeof logActivity === 'function') {
                        logActivity('CHƠI GAME', gameName, `Đạt ${score} điểm`);
                    }
                    
                    if(typeof toast === 'function') toast(`+${score} điểm tích lũy!`, 'success');
                }
            } catch (e) {
                console.error("Lỗi lưu điểm:", e);
            }
        }
    }, 100);
};

/* =========================================
   FIXED MUSIC PLAYER (FINAL VERSION)
   ========================================= */

(function() {
    // 1. Singleton Audio: Đảm bảo chỉ có 1 audio tồn tại trên toàn bộ trang web
    // Nếu chưa có thì tạo mới, nếu có rồi thì dùng lại cái cũ
    if (!window.globalAudio) {
        window.globalAudio = new Audio();
    }
    const audio = window.globalAudio; 

    // 2. Kiểm tra Widget trong HTML
    const widget = document.getElementById('music-widget');
    if (!widget) return; // Không có HTML thì không chạy

    // 3. Dữ liệu Playlist
    const myPlaylist = [
        {
            title: "Phép màu",
            artist: "Mounter_x_MAYDAYs,_Minh_Tốc",
            src: "https://image2url.com/audio/1766419496648-c692c2a6-b66a-4b8a-9cc9-da5f6fb4cf06.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
         {
            title: "Nỗi đau giữa hòa bình",
            artist: "Hòa minzy , Nguyễn Văn Chung",
            src: "https://image2url.com/audio/1766419395887-dd7448f1-6d67-4545-9e83-9921b63fd78e.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
         {
            title: "Còn Gì Đẹp Hơn",
            artist: "Nguyễn Hùng",
            src: "https://image2url.com/audio/1766419293449-40091011-7d16-4b35-8920-71ee92588199.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Beat 6",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418768336-05533a97-5e1d-4028-98b2-fcc4899639ed.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },{
            title: "Beat 5",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418634806-49476398-1a05-46ce-b7b6-3fa40dc02a26.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },{
            title: "Beat 4",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418466817-48b70867-1b4e-48da-9b02-27b678c85682.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },{
            title: "Beat 3",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418529588-4e7c2259-26cb-4b1e-a002-ae8dc128c0c2.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },{
            title: "Beat 2",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418317323-317ff2e5-62e8-4ba9-83fc-0ee7a3c5b3ff.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },{
            title: "Lofi Study Chill",
            artist: "Chill Cow",
            src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Kiếp sau vẫn là người Việt Nam ",
            artist: "NSND THU HUYỀN, Q.THIÊN, DƯƠNG H.YẾN, QUÂN A.P, L.B.NGỌC",
            src: "https://image2url.com/r2/bucket1/audio/1767770669145-c65d838f-fedf-4144-a10d-717c6870323e.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Made In Viet Nam ",
            artist: "Phương Mỹ Chi , Trúc Nhân , Thanh Hoa",
            src: "https://image2url.com/r2/bucket1/audio/1767770502036-1536c1f1-db56-43c5-bbc3-a40714d28063.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Nhà tôi có treo một lá cờ",
            artist: "Hà Anh Tuấn",
            src: "https://image2url.com/r2/bucket3/audio/1767770755973-cd025ec2-b849-402b-8ba0-53be267994c7.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Vì một Việt Nam khỏe mạnh",
            artist: "HÒA MINZY x NGUYỄN HẢI PHONG",
            src: "https://image2url.com/r2/bucket1/audio/1767771021539-03aac5a7-c022-4cf7-b80d-24e992241219.mp3",
            cover: "https://placehold.co/100x100/6366f1/white?text=Lofi"
        },
        {
            title: "Beat 1",
            artist: "HTP Music Team",
            src: "https://image2url.com/audio/1766418171290-22222a2e-d6aa-4dc1-bc98-86bad2f08119.mp3",
            cover: "https://placehold.co/100x100/ec4899/white?text=Piano"
        }
    ];

    // Khai báo biến trạng thái
    let songIndex = 0;
    // Quan trọng: Kiểm tra xem audio có thực sự đang chạy không chứ không chỉ dựa vào biến cờ
    let isPlaying = !audio.paused; 

    // Lấy Element
    const playBtn = document.getElementById('play-btn');
    const cover = document.getElementById('song-cover');
    const indicator = document.getElementById('music-indicator');
    const title = document.getElementById('song-title');
    const artist = document.getElementById('song-artist');
    const progress = document.getElementById('progress-bar');

    // --- CÁC HÀM ĐIỀU KHIỂN (GẮN VÀO WINDOW) ---

    // 1. Hàm Bật/Tắt Widget
    window.toggleMusicPlayer = function() {
        widget.classList.toggle('translate-y-[150%]');
        widget.classList.toggle('opacity-0');
    };

    // 2. Hàm Play/Pause (Đã sửa logic chặt chẽ hơn)
    window.playPauseMusic = function() {
        if (!audio.paused) {
            // Đang hát -> Dừng lại
            audio.pause();
            isPlaying = false;
            updatePlayButtonUI(false);
        } else {
            // Đang dừng -> Hát
            audio.play().catch(e => console.log("Chưa tương tác với web nên chưa tự play được"));
            isPlaying = true;
            updatePlayButtonUI(true);
        }
    };

    // 3. Cập nhật giao diện nút bấm
    function updatePlayButtonUI(isPlayingState) {
        if(isPlayingState) {
            if(playBtn) playBtn.innerHTML = '<i class="fas fa-pause"></i>';
            if(cover) cover.style.animationPlayState = 'running';
            if(indicator) indicator.classList.remove('hidden');
        } else {
            if(playBtn) playBtn.innerHTML = '<i class="fas fa-play ml-0.5"></i>';
            if(cover) cover.style.animationPlayState = 'paused';
            if(indicator) indicator.classList.add('hidden');
        }
    }

    // 4. Next / Prev
    window.nextSong = function() {
        songIndex = (songIndex + 1) % myPlaylist.length;
        loadSong(songIndex);
        if (isPlaying) audio.play();
    };

    window.prevSong = function() {
        songIndex = (songIndex - 1 + myPlaylist.length) % myPlaylist.length;
        loadSong(songIndex);
        if (isPlaying) audio.play();
    };

    // 5. Chọn bài từ list
    window.playSpecific = function(idx) {
        songIndex = idx;
        loadSong(songIndex);
        audio.play();
        isPlaying = true;
        updatePlayButtonUI(true);
    };

    // --- HÀM HỖ TRỢ ---
    function loadSong(index) {
        const song = myPlaylist[index];
        if(title) title.innerText = song.title;
        if(artist) artist.innerText = song.artist;
        if(cover) cover.src = song.cover;
        
        // Chỉ đổi src nếu bài hát khác bài đang load (tránh load lại khi đang pause)
        if (audio.src !== song.src) {
            audio.src = song.src;
        }
    }

    function formatTime(seconds) {
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' + sec : sec}`;
    }

    // --- EVENT LISTENERS ---
    
    // Khi nhạc chạy, cập nhật thanh tiến trình
    audio.ontimeupdate = (e) => {
        if(audio.duration && progress) {
            const percent = (audio.currentTime / audio.duration) * 100;
            progress.value = percent;
            document.getElementById('curr-time').innerText = formatTime(audio.currentTime);
            document.getElementById('dur-time').innerText = formatTime(audio.duration);
        }
    };

    // Tự động chuyển bài khi hết
    audio.onended = window.nextSong;

    // Tua nhạc
    if(progress) {
        progress.oninput = () => {
            const duration = audio.duration;
            audio.currentTime = (progress.value / 100) * duration;
        };
    }

    // Render List
    const ul = document.getElementById('playlist-ul');
    if(ul) {
        ul.innerHTML = myPlaylist.map((song, idx) => `
            <li onclick="playSpecific(${idx})" class="text-xs p-2 hover:bg-indigo-50 rounded cursor-pointer flex justify-between items-center text-gray-600 hover:text-indigo-600 transition">
                <span>${idx + 1}. ${song.title}</span>
                <i class="fas fa-play-circle opacity-0 hover:opacity-100"></i>
            </li>
        `).join('');
    }

    // --- KHỞI CHẠY LẦN ĐẦU ---
    loadSong(songIndex);
    // Đồng bộ UI với trạng thái thực tế của audio (đề phòng audio đang chạy từ trang trước)
    updatePlayButtonUI(!audio.paused);
    // Thêm vào cuối file script.js
    window.spinWheel = spinWheel;
})();

