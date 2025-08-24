// elements
const $ = (id) => document.getElementById(id);
const main = $("main");
const openManageUsers = $("openManageUsers");
const openAddTemplate = $("openAddTemplate");
const openManageTemplates = $("openManageTemplates");
const openSettings = $("openSettings");
const userForm = $("userForm");
const scookie = $("scookie");
const jcookie = $("jcookie");
const submitUser = $("submitUser");
const manageUsers = $("manageUsers");
const manageUsersTitle = $("manageUsersTitle");
const userList = $("userList");
const checkUserStatus = $("checkUserStatus");
const addTemplate = $("addTemplate");
const convert = $("convert");
const details = $("details");
const size = $("size");
const ink = $("ink");
const templateCanvas = $("templateCanvas");
const previewCanvas = $("previewCanvas");
const previewCanvasButton = $("previewCanvasButton");
const previewBorder = $("previewBorder");
const templateForm = $("templateForm");
const templateFormTitle = $("templateFormTitle");
const convertInput = $("convertInput");
const templateName = $("templateName");
const tx = $("tx");
const ty = $("ty");
const px = $("px");
const py = $("py");
const userSelectList = $("userSelectList");
const selectAllUsers = $("selectAllUsers");
const canBuyMaxCharges = $("canBuyMaxCharges");
const canBuyCharges = $("canBuyCharges");
const antiGriefMode = $("antiGriefMode");
const submitTemplate = $("submitTemplate");
const manageTemplates = $("manageTemplates");
const templateList = $("templateList");
const startAll = $("startAll");
const stopAll = $("stopAll");
const settings = $("settings");
const drawingDirectionSelect = $("drawingDirectionSelect");
const drawingOrderSelect = $("drawingOrderSelect");
const outlineMode = $("outlineMode");
const interleavedMode = $("interleavedMode");
const skipPaintedPixels = $("skipPaintedPixels");
const turnstileNotifications = $("turnstileNotifications");
const accountCooldown = $("accountCooldown");
const purchaseCooldown = $("purchaseCooldown");
const accountCheckCooldown = $("accountCheckCooldown");
const dropletReserve = $("dropletReserve");
const antiGriefStandby = $("antiGriefStandby");
const chargeThreshold = $("chargeThreshold");
const totalCharges = $("totalCharges");
const totalMaxCharges = $("totalMaxCharges");
const messageBoxOverlay = $("messageBoxOverlay");
const messageBoxTitle = $("messageBoxTitle");
const messageBoxContent = $("messageBoxContent");
const messageBoxConfirm = $("messageBoxConfirm");
const messageBoxCancel = $("messageBoxCancel");
const usePaidColors = $("usePaidColors");

// --- Global State ---
let templateUpdateInterval = null;

// Message Box
let confirmCallback = null;

const showMessage = (title, content) => {
    messageBoxTitle.innerHTML = title;
    messageBoxContent.innerHTML = content;
    messageBoxCancel.classList.add('hidden');
    messageBoxConfirm.textContent = 'OK';
    messageBoxOverlay.classList.remove('hidden');
    confirmCallback = null;
};

const showConfirmation = (title, content, onConfirm) => {
    messageBoxTitle.innerHTML = title;
    messageBoxContent.innerHTML = content;
    messageBoxCancel.classList.remove('hidden');
    messageBoxConfirm.textContent = 'Confirm';
    messageBoxOverlay.classList.remove('hidden');
    confirmCallback = onConfirm;
};

const closeMessageBox = () => {
    messageBoxOverlay.classList.add('hidden');
    confirmCallback = null;
};

messageBoxConfirm.addEventListener('click', () => {
    if (confirmCallback) {
        confirmCallback();
    }
    closeMessageBox();
});

messageBoxCancel.addEventListener('click', () => {
    closeMessageBox();
});

const handleError = (error) => {
    console.error(error);
    let message = "An unknown error occurred. Check the console for details.";

    if (error.code === 'ERR_NETWORK') {
        message = "Could not connect to the server. Please ensure the bot is running and accessible.";
    } else if (error.response && error.response.data && error.response.data.error) {
        const errMsg = error.response.data.error;
        if (errMsg.includes("(1015)")) {
            message = "You are being rate-limited by the server. Please wait a moment before trying again.";
        } else if (errMsg.includes("(500)")) {
            message = "Authentication failed. The user's cookie may be expired or invalid. Please try adding the user again with a new cookie.";
        } else if (errMsg.includes("(502)")) {
            message = "The server reported a 'Bad Gateway' error. It might be temporarily down or restarting. Please try again in a few moments.";
        } else {
            message = errMsg;
        }
    }
    showMessage("Error", message);
};


// users
const loadUsers = async (f) => {
    try {
        const users = await axios.get("/users");
        if (f) f(users.data);
    } catch (error) {
        handleError(error);
    };
};
userForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const response = await axios.post('/user', { cookies: { s: scookie.value, j: jcookie.value } });
        if (response.status === 200) {
            showMessage("Success", `Logged in as ${response.data.name} (#${response.data.id})!`);
            userForm.reset();
            openManageUsers.click(); // Refresh the view
        }
    } catch (error) {
        handleError(error);
    };
});

// templates
const basic_colors = { "0,0,0": 1, "60,60,60": 2, "120,120,120": 3, "210,210,210": 4, "255,255,255": 5, "96,0,24": 6, "237,28,36": 7, "255,127,39": 8, "246,170,9": 9, "249,221,59": 10, "255,250,188": 11, "14,185,104": 12, "19,230,123": 13, "135,255,94": 14, "12,129,110": 15, "16,174,166": 16, "19,225,190": 17, "40,80,158": 18, "64,147,228": 19, "96,247,242": 20, "107,80,246": 21, "153,177,251": 22, "120,12,153": 23, "170,56,185": 24, "224,159,249": 25, "203,0,122": 26, "236,31,128": 27, "243,141,169": 28, "104,70,52": 29, "149,104,42": 30, "248,178,119": 31 };
const premium_colors = { "170,170,170": 32, "165,14,30": 33, "250,128,114": 34, "228,92,26": 35, "214,181,148": 36, "156,132,49": 37, "197,173,49": 38, "232,212,95": 39, "74,107,58": 40, "90,148,74": 41, "132,197,115": 42, "15,121,159": 43, "187,250,242": 44, "125,199,255": 45, "77,49,184": 46, "74,66,132": 47, "122,113,196": 48, "181,174,241": 49, "219,164,99": 50, "209,128,81": 51, "255,197,165": 52, "155,82,73": 53, "209,128,120": 54, "250,182,164": 55, "123,99,82": 56, "156,132,107": 57, "51,57,65": 58, "109,117,141": 59, "179,185,209": 60, "109,100,63": 61, "148,140,107": 62, "205,197,158": 63 };
const colors = { ...basic_colors, ...premium_colors };

const colorById = (id) => Object.keys(colors).find(key => colors[key] === id);
const closest = color => {
    const [tr, tg, tb] = color.split(',').map(Number);
    // only use basic_colors for closest match to keep current behavior
    return basic_colors[Object.keys(basic_colors).reduce((closest, current) => {
        const [cr, cg, cb] = current.split(',').map(Number);
        const [clR, clG, clB] = closest.split(',').map(Number);
        return Math.sqrt(Math.pow(tr - cr, 2) + Math.pow(tg - cg, 2) + Math.pow(tb - cb, 2)) < Math.sqrt(Math.pow(tr - clR, 2) + Math.pow(tg - clG, 2) + Math.pow(tb - clB, 2)) ? current : closest;
    })];
};

const drawTemplate = (template, canvas) => {
    canvas.width = template.width;
    canvas.height = template.height;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, template.width, template.height);
    const imageData = new ImageData(template.width, template.height);
    for (let x = 0; x < template.width; x++) {
        for (let y = 0; y < template.height; y++) {
            const color = template.data[x][y];
            if (color === 0) continue;
            const i = (y * template.width + x) * 4;
            if (color === -1) {
                imageData.data[i] = 158;
                imageData.data[i + 1] = 189;
                imageData.data[i + 2] = 255;
                imageData.data[i + 3] = 255;
                continue;
            };
            const [r, g, b] = colorById(color).split(',').map(Number);
            imageData.data[i] = r;
            imageData.data[i + 1] = g;
            imageData.data[i + 2] = b;
            imageData.data[i + 3] = 255;
        };
    };
    ctx.putImageData(imageData, 0, 0);
};
const loadTemplates = async (f) => {
    try {
        const templates = await axios.get("/templates");
        if (f) f(templates.data);
    } catch (error) {
        handleError(error);
    };
};
const fetchCanvas = async (txVal, tyVal, pxVal, pyVal, width, height) => {
    const TILE_SIZE = 1000;
    const radius = Math.max(0, parseInt(previewBorder.value, 10) || 0);

    const startX = txVal * TILE_SIZE + pxVal - radius;
    const startY = tyVal * TILE_SIZE + pyVal - radius;
    const displayWidth = width + (radius * 2);
    const displayHeight = height + (radius * 2);
    const endX = startX + displayWidth;
    const endY = startY + displayHeight;

    const startTileX = Math.floor(startX / TILE_SIZE);
    const startTileY = Math.floor(startY / TILE_SIZE);
    const endTileX = Math.floor((endX - 1) / TILE_SIZE);
    const endTileY = Math.floor((endY - 1) / TILE_SIZE);

    previewCanvas.width = displayWidth;
    previewCanvas.height = displayHeight;
    const ctx = previewCanvas.getContext('2d');
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    for (let txi = startTileX; txi <= endTileX; txi++) {
        for (let tyi = startTileY; tyi <= endTileY; tyi++) {
            try {
                const response = await axios.get('/canvas', { params: { tx: txi, ty: tyi } });
                const img = new Image();
                img.src = response.data.image;
                await img.decode();
                const sx = (txi === startTileX) ? startX - txi * TILE_SIZE : 0;
                const sy = (tyi === startTileY) ? startY - tyi * TILE_SIZE : 0;
                const ex = (txi === endTileX) ? endX - txi * TILE_SIZE : TILE_SIZE;
                const ey = (tyi === endTileY) ? endY - tyi * TILE_SIZE : TILE_SIZE;
                const sw = ex - sx;
                const sh = ey - sy;
                const dx = txi * TILE_SIZE + sx - startX;
                const dy = tyi * TILE_SIZE + sy - startY;
                ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
            } catch (error) {
                handleError(error);
                return;
            }
        }
    }

    const baseImage = ctx.getImageData(0, 0, displayWidth, displayHeight);
    const templateCtx = templateCanvas.getContext('2d');
    const templateImage = templateCtx.getImageData(0, 0, width, height);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(templateCanvas, radius, radius);
    ctx.globalAlpha = 1;
    const b = baseImage.data;
    const t = templateImage.data;
    for (let i = 0; i < t.length; i += 4) {
        // skip transparent template pixels
        if (t[i + 3] === 0) continue;

        const templateIdx = i / 4;
        const templateX = templateIdx % width;
        const templateY = Math.floor(templateIdx / width);
        const canvasX = templateX + radius;
        const canvasY = templateY + radius;
        const canvasIdx = (canvasY * displayWidth + canvasX) * 4;

        if (b[canvasIdx + 3] === 0) continue;

        ctx.fillStyle = 'rgba(255,0,0,0.8)';
        ctx.fillRect(canvasX, canvasY, 1, 1);
    }
};

const nearestimgdecoder = (imageData, width, height) => {
    const d = imageData.data;
    const matrix = Array.from({ length: width }, () => Array(height).fill(0));
    let ink = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const a = d[i + 3];
            if (a === 255) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                const rgb = `${r},${g},${b}`;
                if (rgb == "158,189,255") matrix[x][y] = -1;
                else {
                    const id = colors[rgb] && usePaidColors.checked ? colors[rgb] : closest(rgb);
                    matrix[x][y] = id;
                };
                ink++;
            } else {
                matrix[x][y] = 0;
            }
        }
    }
    return { matrix, ink };
};

let currentTemplate = { width: 0, height: 0, data: [] };

const processImageFile = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const image = new Image();
        image.src = e.target.result;
        image.onload = async () => {
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const { matrix, ink } = nearestimgdecoder(imageData, canvas.width, canvas.height);

            const template = {
                width: canvas.width,
                height: canvas.height,
                ink,
                data: matrix
            };

            canvas.remove();
            callback(template);
        };
    };
    reader.readAsDataURL(file);
};
const processEvent = () => {
    const file = convertInput.files[0];
    if (file) {
        templateName.value = file.name.replace(/\.[^/.]+$/, "");
        processImageFile(file, (template) => {
            currentTemplate = template;
            drawTemplate(template, templateCanvas);
            size.innerHTML = `${template.width}x${template.height}px`;
            ink.innerHTML = template.ink;
            details.style.display = "block";
        });
    };
};
convertInput.addEventListener('change', processEvent);
usePaidColors.addEventListener('change', processEvent);

previewCanvasButton.addEventListener('click', async () => {
    const txVal = parseInt(tx.value, 10);
    const tyVal = parseInt(ty.value, 10);
    const pxVal = parseInt(px.value, 10);
    const pyVal = parseInt(py.value, 10);
    if (isNaN(txVal) || isNaN(tyVal) || isNaN(pxVal) || isNaN(pyVal) || currentTemplate.width === 0) {
        showMessage("Error", "Please convert an image and enter valid coordinates before previewing.");
        return;
    }
    await fetchCanvas(txVal, tyVal, pxVal, pyVal, currentTemplate.width, currentTemplate.height);
});

canBuyMaxCharges.addEventListener('change', () => {
    if (canBuyMaxCharges.checked) {
        canBuyCharges.checked = false;
    }
});

canBuyCharges.addEventListener('change', () => {
    if (canBuyCharges.checked) {
        canBuyMaxCharges.checked = false;
    }
});

const resetTemplateForm = () => {
    templateForm.reset();
    templateFormTitle.textContent = "Add Template";
    submitTemplate.innerHTML = '<img src="icons/addTemplate.svg">Add Template';
    delete templateForm.dataset.editId;
    details.style.display = "none";
    currentTemplate = { width: 0, height: 0, data: [] };
};

templateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isEditMode = !!templateForm.dataset.editId;

    if (!isEditMode && (!currentTemplate || currentTemplate.width === 0)) {
        showMessage("Error", "Please convert an image before creating a template.");
        return;
    }
    const selectedUsers = Array.from(document.querySelectorAll('input[name="user_checkbox"]:checked')).map(cb => cb.value);
    if (selectedUsers.length === 0) {
        showMessage("Error", "Please select at least one user.");
        return;
    }

    const data = {
        templateName: templateName.value,
        coords: [tx.value, ty.value, px.value, py.value].map(Number),
        userIds: selectedUsers,
        canBuyCharges: canBuyCharges.checked,
        canBuyMaxCharges: canBuyMaxCharges.checked,
        antiGriefMode: antiGriefMode.checked
    };

    if (currentTemplate && currentTemplate.width > 0) {
        data.template = currentTemplate;
    }

    try {
        if (isEditMode) {
            await axios.put(`/template/edit/${templateForm.dataset.editId}`, data);
            showMessage("Success", "Template updated!");
        } else {
            await axios.post('/template', data);
            showMessage("Success", "Template created!");
        }
        resetTemplateForm();
        openManageTemplates.click();
    } catch (error) {
        handleError(error);
    };
});
startAll.addEventListener('click', async () => {
    for (const child of templateList.children) {
        try {
            await axios.put(`/template/${child.id}`, { running: true });
        } catch (error) {
            handleError(error);
        };
    };
    showMessage("Success", "Finished! Check console for details.");
    openManageTemplates.click();
});
stopAll.addEventListener('click', async () => {
    for (const child of templateList.children) {
        try {
            await axios.put(`/template/${child.id}`, { running: false });
        } catch (error) {
            handleError(error);
        };
    };
    showMessage("Success", "Finished! Check console for details.");
    openManageTemplates.click();
});


// tabs
let currentTab = main;
const changeTab = (el) => {
    if (templateUpdateInterval) {
        clearInterval(templateUpdateInterval);
        templateUpdateInterval = null;
    }
    currentTab.style.display = "none";
    el.style.display = "block";
    currentTab = el;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
openManageUsers.addEventListener("click", () => {
    userList.innerHTML = "";
    userForm.reset();
    totalCharges.textContent = "?";
    totalMaxCharges.textContent = "?";
    loadUsers(users => {
        const userCount = Object.keys(users).length;
        manageUsersTitle.textContent = `Existing Users (${userCount})`;
        for (const id of Object.keys(users)) {
            const user = document.createElement('div');
            user.className = 'user';
            user.id = `user-${id}`;
            const expirationDate = users[id].expirationDate;
            let expirationStr = "N/A"

            if (expirationDate) {
                const targetDate = new Date(expirationDate * 1000);
                const now = new Date();
                const diff = targetDate - now;
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                expirationStr = `${days}d ${hours}h`;
            }

            user.innerHTML = `
                <div class="user-info">
                    <span class="user-name">${users[id].name}</span>
                    <span class="user-id">#${id}</span>
                    <div class="user-stats">
                        <div>
                            <img class="charges-icon" src="icons/charges.svg">
                            <b><span class="current-charges">?</span></b>/<b><span class="max-charges">?</span></b>
                        </div>
                        <div>
                            <img class="droplets-icon" src="icons/droplet.svg">
                            <b><span class="current-droplets">?</span></b>
                        </div>
                        <div>
                            <img class="level-icon" src="icons/level.svg">
                            <b><span class="current-level">?</span></b> <span class="level-progress">(?%)</span>
                        </div>
                        <div>
                            <img class="expires-icon" src="icons/expires.svg"> <b>${expirationStr}</b>
                        </div>
                    </div>
                </div>
                <div class="user-actions">
                    <button class="refresh-btn" title="Refresh User Info"><img src="icons/restart.svg"></button>
                    <button class="info-btn" title="Get User Info"><img src="icons/code.svg"></button>
                    <button class="delete-btn" title="Delete User"><img src="icons/remove.svg"></button>
                </div>`;

            user.querySelector('.delete-btn').addEventListener("click", () => {
                showConfirmation(
                    "Delete User",
                    `Are you sure you want to delete ${users[id].name} (#${id})? This will also remove them from all templates.`,
                    async () => {
                        try {
                            await axios.delete(`/user/${id}`);
                            showMessage("Success", "User deleted.");
                            openManageUsers.click();
                        } catch (error) {
                            handleError(error);
                        };
                    }
                );
            });
            user.querySelector('.refresh-btn').addEventListener("click", async () => {
                const infoSpans = user.querySelectorAll('.user-info > span');
                const currentChargesEl = user.querySelector('.user-stats .current-charges');
                const maxChargesEl = user.querySelector('.user-stats .max-charges');
                const currentLevelEl = user.querySelector('.user-stats .current-level');
                const levelProgressEl = user.querySelector('.level-progress');
                const currentDropletsEl = user.querySelector('.user-stats .current-droplets');

                infoSpans.forEach(span => span.style.color = 'var(--warning-color)');
                try {
                    const response = await axios.get(`/user/status/${id}`);
                    const userInfo = response.data;

                    const charges = Math.floor(userInfo.charges.count);
                    const max = userInfo.charges.max;
                    const level = Math.floor(userInfo.level);
                    const progress = Math.round((userInfo.level % 1) * 100);

                    currentChargesEl.textContent = charges;
                    maxChargesEl.textContent = max;
                    currentLevelEl.textContent = level;
                    levelProgressEl.textContent = `(${progress}%)`;
                    currentDropletsEl.textContent = userInfo.droplets;

                    infoSpans.forEach(span => span.style.color = 'var(--success-color)');
                } catch (error) {
                    currentChargesEl.textContent = "?";
                    maxChargesEl.textContent = "?";
                    currentLevelEl.textContent = "?";
                    levelProgressEl.textContent = "(?%)";
                    currentDropletsEl.textContent = "?";
                    infoSpans.forEach(span => span.style.color = 'var(--error-color)');
                    handleError(error);
                }
            })
            user.querySelector('.info-btn').addEventListener("click", async () => {
                try {
                    const response = await axios.get(`/user/status/${id}`);
                    const info = `
                    <b>User Name:</b> <span style="color: #f97a1f;">${response.data.name}</span><br>
                    <b>Charges:</b> <span style="color: #f97a1f;">${Math.floor(response.data.charges.count)}</span>/<span style="color: #f97a1f;">${response.data.charges.max}</span><br>
                    <b>Droplets:</b> <span style="color: #f97a1f;">${response.data.droplets}</span><br>
                    <b>Favorite Locations:</b> <span style="color: #f97a1f;">${response.data.favoriteLocations.length}</span>/<span style="color: #f97a1f;">${response.data.maxFavoriteLocations}</span><br>
                    <b>Flag Equipped:</b> <span style="color: #f97a1f;">${response.data.equippedFlag ? "Yes" : "No"}</span><br>
                    <b>Discord:</b> <span style="color: #f97a1f;">${response.data.discord}</span><br>
                    <b>Country:</b> <span style="color: #f97a1f;">${response.data.country}</span><br>
                    <b>Pixels Painted:</b> <span style="color: #f97a1f;">${response.data.pixelsPainted}</span><br>
                    <b>Extra Colors:</b> <span style="color: #f97a1f;">${response.data.extraColorsBitmap}</span><br>
                    <b>Alliance ID:</b> <span style="color: #f97a1f;">${response.data.allianceId}</span><br>
                    <b>Alliance Role:</b> <span style="color: #f97a1f;">${response.data.allianceRole}</span><br>
                    <br>Would you like to copy the <b>Raw Json</b> to your clipboard?
                    `;

                    showConfirmation("User Info", info, () => {
                        navigator.clipboard.writeText(JSON.stringify(response.data, null, 2));
                    });
                } catch (error) {
                    handleError(error);
                };
            });
            userList.appendChild(user);
        };
    });
    changeTab(manageUsers);
});

checkUserStatus.addEventListener("click", async () => {
    checkUserStatus.disabled = true;
    checkUserStatus.innerHTML = "Checking...";
    const userElements = Array.from(document.querySelectorAll('.user'));

    let totalCurrent = 0;
    let totalMax = 0;

    const { data: settings } = await axios.get('/settings');
    const cooldown = settings.accountCheckCooldown || 0;

    for (const userEl of userElements) {
        const id = userEl.id.split('-')[1];
        const infoSpans = userEl.querySelectorAll('.user-info > span');
        const currentChargesEl = userEl.querySelector('.user-stats .current-charges');
        const maxChargesEl = userEl.querySelector('.user-stats .max-charges');
        const currentLevelEl = userEl.querySelector('.user-stats .current-level');
        const levelProgressEl = userEl.querySelector('.level-progress');
        const currentDropletsEl = userEl.querySelector('.user-stats .current-droplets');

        infoSpans.forEach(span => span.style.color = 'var(--warning-color)');
        try {
            const response = await axios.get(`/user/status/${id}`);
            const userInfo = response.data;

            const charges = Math.floor(userInfo.charges.count);
            const max = userInfo.charges.max;
            const level = Math.floor(userInfo.level);
            const progress = Math.round((userInfo.level % 1) * 100);

            currentChargesEl.textContent = charges;
            maxChargesEl.textContent = max;
            currentLevelEl.textContent = level;
            levelProgressEl.textContent = `(${progress}%)`;
            currentDropletsEl.textContent = userInfo.droplets;
            totalCurrent += charges;
            totalMax += max;

            infoSpans.forEach(span => span.style.color = 'var(--success-color)');
        } catch (error) {
            currentChargesEl.textContent = "?";
            maxChargesEl.textContent = "?";
            currentLevelEl.textContent = "?";
            levelProgressEl.textContent = "(?%)";
            infoSpans.forEach(span => span.style.color = 'var(--error-color)');
        }
        if (cooldown > 0) {
            await sleep(cooldown);
        }
    }

    totalCharges.textContent = totalCurrent;
    totalMaxCharges.textContent = totalMax;

    checkUserStatus.disabled = false;
    checkUserStatus.innerHTML = '<img src="icons/check.svg">Check Account Status';
});
openAddTemplate.addEventListener("click", () => {
    resetTemplateForm();
    userSelectList.innerHTML = "";
    loadUsers(users => {
        if (Object.keys(users).length === 0) {
            userSelectList.innerHTML = "<span>No users added. Please add a user first.</span>";
            return;
        }
        for (const id of Object.keys(users)) {
            const userDiv = document.createElement('div');
            userDiv.className = 'user-select-item';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `user_${id}`;
            checkbox.name = 'user_checkbox';
            checkbox.value = id;
            const label = document.createElement('label');
            label.htmlFor = `user_${id}`;
            label.textContent = `${users[id].name} (#${id})`;
            userDiv.appendChild(checkbox);
            userDiv.appendChild(label);
            userSelectList.appendChild(userDiv);
        }
    });
    changeTab(addTemplate);
});
selectAllUsers.addEventListener('click', () => {
    document.querySelectorAll('#userSelectList input[type="checkbox"]').forEach(cb => cb.checked = true);
});

const createToggleButton = (template, id, buttonsContainer, progressBarText, currentPercent) => {
    const button = document.createElement('button');
    const isRunning = template.running;

    button.className = isRunning ? 'destructive-button' : 'primary-button';
    button.innerHTML = `<img src="icons/${isRunning ? 'pause' : 'play'}.svg">${isRunning ? 'Stop' : 'Start'} Template`;

    button.addEventListener('click', async () => {
        try {
            await axios.put(`/template/${id}`, { running: !isRunning });
            template.running = !isRunning;
            const newStatus = !isRunning ? 'Started' : 'Stopped';
            const newButton = createToggleButton(template, id, buttonsContainer, progressBarText, currentPercent);
            button.replaceWith(newButton);
            progressBarText.textContent = `${currentPercent}% | ${newStatus}`;
            const progressBar = progressBarText.previousElementSibling;
            progressBar.classList.toggle('stopped', !isRunning);

        } catch (error) {
            handleError(error);
        }
    });
    return button;
};

const updateTemplateStatus = async () => {
    try {
        const { data: templates } = await axios.get("/templates");
        for (const id in templates) {
            const t = templates[id];
            const templateElement = $(id);
            if (!templateElement) continue;

            const total = t.totalPixels || 1;
            const remaining = t.pixelsRemaining !== null ? t.pixelsRemaining : total;
            const completed = total - remaining;
            const percent = Math.floor((completed / total) * 100);

            const progressBar = templateElement.querySelector('.progress-bar');
            const progressBarText = templateElement.querySelector('.progress-bar-text');
            const pixelCount = templateElement.querySelector('.pixel-count');

            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressBarText) progressBarText.textContent = `${percent}% | ${t.status}`;
            if (pixelCount) pixelCount.textContent = `${completed} / ${total}`;

            if (t.status === "Finished.") {
                progressBar.classList.add('finished');
                progressBar.classList.remove('stopped');
            } else if (!t.running) {
                progressBar.classList.add('stopped');
                progressBar.classList.remove('finished');
            } else {
                progressBar.classList.remove('stopped', 'finished');
            }
        }
    } catch (error) {
        console.error("Failed to update template statuses:", error);
    }
};

openManageTemplates.addEventListener("click", () => {
    templateList.innerHTML = "";
    if (templateUpdateInterval) clearInterval(templateUpdateInterval);

    loadUsers(users => {
        loadTemplates(templates => {
            for (const id of Object.keys(templates)) {
                const t = templates[id];
                const userListFormatted = t.userIds.map(userId => {
                    const user = users[userId];
                    return user ? `${user.name}#${userId}` : `Unknown#${userId}`;
                }).join(", ");

                const template = document.createElement('div');
                template.id = id;
                template.className = "template";

                const total = t.totalPixels || 1;
                const remaining = t.pixelsRemaining !== null ? t.pixelsRemaining : total;
                const completed = total - remaining;
                const percent = Math.floor((completed / total) * 100);

                const infoSpan = document.createElement('span');
                infoSpan.innerHTML = `
                    <b>Template Name:</b> ${t.name}
                    <br>
                    <b>Assigned Accounts:</b>
                    <span class="assigned-accounts folded">${userListFormatted}</span>
                    <b>Coordinates:</b> ${t.coords.join(", ")}
                    <br>
                    <b>Pixels:</b>
                    <span class="pixel-count">${completed} / ${total}
                    </span>`;
                template.appendChild(infoSpan);

                infoSpan.querySelector('.assigned-accounts').addEventListener('click', (e) => {
                    e.target.classList.toggle('folded');
                });

                const progressBarContainer = document.createElement('div');
                progressBarContainer.className = 'progress-bar-container';

                const progressBar = document.createElement('div');
                progressBar.className = 'progress-bar';
                progressBar.style.width = `${percent}%`;

                const progressBarText = document.createElement('span');
                progressBarText.className = 'progress-bar-text';
                progressBarText.textContent = `${percent}% | ${t.status}`;

                if (t.status === "Finished.") {
                    progressBar.classList.add('finished');
                } else if (!t.running) {
                    progressBar.classList.add('stopped');
                }

                progressBarContainer.appendChild(progressBar);
                progressBarContainer.appendChild(progressBarText);
                template.appendChild(progressBarContainer);

                const canvas = document.createElement("canvas");
                drawTemplate(t.template, canvas);
                const buttons = document.createElement('div');
                buttons.className = "template-actions";

                const toggleButton = createToggleButton(t, id, buttons, progressBarText, percent);
                buttons.appendChild(toggleButton);

                const editButton = document.createElement('button');
                editButton.className = 'secondary-button';
                editButton.innerHTML = '<img src="icons/settings.svg">Edit Template';
                editButton.addEventListener('click', () => {
                    openAddTemplate.click();
                    templateFormTitle.textContent = `Edit Template: ${t.name}`;
                    submitTemplate.innerHTML = '<img src="icons/edit.svg">Save Changes';
                    templateForm.dataset.editId = id;

                    templateName.value = t.name;
                    [tx.value, ty.value, px.value, py.value] = t.coords;
                    canBuyCharges.checked = t.canBuyCharges;
                    canBuyMaxCharges.checked = t.canBuyMaxCharges;
                    antiGriefMode.checked = t.antiGriefMode;

                    document.querySelectorAll('input[name="user_checkbox"]').forEach(cb => {
                        if (t.userIds.includes(cb.value)) {
                            cb.checked = true;
                        }
                    });
                });

                const delButton = document.createElement('button');
                delButton.className = 'destructive-button';
                delButton.innerHTML = '<img src="icons/remove.svg">Delete Template';
                delButton.addEventListener("click", () => {
                    showConfirmation(
                        "Delete Template",
                        `Are you sure you want to delete template "${t.name}"?`,
                        async () => {
                            try {
                                await axios.delete(`/template/${id}`);
                                openManageTemplates.click();
                            } catch (error) {
                                handleError(error);
                            };
                        }
                    );
                });
                buttons.append(editButton);
                buttons.append(delButton);
                template.append(canvas);
                template.append(buttons);
                templateList.append(template);
            };
            templateUpdateInterval = setInterval(updateTemplateStatus, 2000);
        });
    });
    changeTab(manageTemplates);
});
openSettings.addEventListener("click", async () => {
    try {
        const response = await axios.get('/settings');
        const currentSettings = response.data;
        drawingDirectionSelect.value = currentSettings.drawingDirection;
        drawingOrderSelect.value = currentSettings.drawingOrder;
        turnstileNotifications.checked = currentSettings.turnstileNotifications;
        outlineMode.checked = currentSettings.outlineMode;
        interleavedMode.checked = currentSettings.interleavedMode;
        skipPaintedPixels.checked = currentSettings.skipPaintedPixels;
        accountCooldown.value = currentSettings.accountCooldown / 1000;
        purchaseCooldown.value = currentSettings.purchaseCooldown / 1000;
        accountCheckCooldown.value = currentSettings.accountCheckCooldown / 1000;
        dropletReserve.value = currentSettings.dropletReserve;
        antiGriefStandby.value = currentSettings.antiGriefStandby / 60000;
        chargeThreshold.value = currentSettings.chargeThreshold * 100;
    } catch (error) {
        handleError(error);
    }
    changeTab(settings);
});

// Settings
const saveSetting = async (setting) => {
    try {
        await axios.put('/settings', setting);
        showMessage("Success", "Setting saved!");
    } catch (error) {
        handleError(error);
    }
};

drawingDirectionSelect.addEventListener('change', () => saveSetting({ drawingDirection: drawingDirectionSelect.value }));
drawingOrderSelect.addEventListener('change', () => saveSetting({ drawingOrder: drawingOrderSelect.value }));
turnstileNotifications.addEventListener('change', () => saveSetting({ turnstileNotifications: turnstileNotifications.checked }));
outlineMode.addEventListener('change', () => saveSetting({ outlineMode: outlineMode.checked }));
interleavedMode.addEventListener('change', () => saveSetting({ interleavedMode: interleavedMode.checked }));
skipPaintedPixels.addEventListener('change', () => saveSetting({ skipPaintedPixels: skipPaintedPixels.checked }));

accountCooldown.addEventListener('change', () => {
    const value = parseInt(accountCooldown.value, 10) * 1000;
    if (isNaN(value) || value < 0) {
        showMessage("Error", "Please enter a valid non-negative number.");
        return;
    }
    saveSetting({ accountCooldown: value });
});

purchaseCooldown.addEventListener('change', () => {
    const value = parseInt(purchaseCooldown.value, 10) * 1000;
    if (isNaN(value) || value < 0) {
        showMessage("Error", "Please enter a valid non-negative number.");
        return;
    }
    saveSetting({ purchaseCooldown: value });
});

accountCheckCooldown.addEventListener('change', () => {
    const value = parseInt(accountCheckCooldown.value, 10) * 1000;
    if (isNaN(value) || value < 0) {
        showMessage("Error", "Please enter a valid non-negative number.");
        return;
    }
    saveSetting({ accountCheckCooldown: value });
});

dropletReserve.addEventListener('change', () => {
    const value = parseInt(dropletReserve.value, 10);
    if (isNaN(value) || value < 0) {
        showMessage("Error", "Please enter a valid non-negative number.");
        return;
    }
    saveSetting({ dropletReserve: value });
});

antiGriefStandby.addEventListener('change', () => {
    const value = parseInt(antiGriefStandby.value, 10) * 60000;
    if (isNaN(value) || value < 60000) {
        showMessage("Error", "Please enter a valid number (at least 1 minute).");
        return;
    }
    saveSetting({ antiGriefStandby: value });
});

chargeThreshold.addEventListener('change', () => {
    const value = parseInt(chargeThreshold.value, 10);
    if (isNaN(value) || value < 0 || value > 100) {
        showMessage("Error", "Please enter a valid percentage between 0 and 100.");
        return;
    }
    saveSetting({ chargeThreshold: value / 100 });
});

tx.addEventListener('blur', () => {
    const value = tx.value.trim();
    const urlRegex = /pixel\/(\d+)\/(\d+)\?x=(\d+)&y=(\d+)/;
    const urlMatch = value.match(urlRegex);

    if (urlMatch) {
        tx.value = urlMatch[1];
        ty.value = urlMatch[2];
        px.value = urlMatch[3];
        py.value = urlMatch[4];
    } else {
        const parts = value.split(/\s+/);
        if (parts.length === 4) {
            tx.value = parts[0].replace(/[^0-9]/g, '');
            ty.value = parts[1].replace(/[^0-9]/g, '');
            px.value = parts[2].replace(/[^0-9]/g, '');
            py.value = parts[3].replace(/[^0-9]/g, '');
        } else {
            tx.value = value.replace(/[^0-9]/g, '');
        }
    }
});

[ty, px, py].forEach(input => {
    input.addEventListener('blur', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
    });
});

paintEvents.on('paint', (data) => {
    console.log('data :>', data)
    if (data.pixelsPainted && data.user.id) {
        const userElement = $(`user-${data.user.id}`);
        const currentCharges = data.user.charges.count;
        const currentDroplets = data.user.droplets

        try {
            userElement.querySelector('.current-charges').textContent = 0;
            userElement.querySelector('.max-charges').textContent = data.user.charges.max;
            userElement.querySelector('.current-level').textContent = Math.floor(data.user.level);
            userElement.querySelector('.level-progress').textContent = `(${Math.round((data.user.level % 1) * 100)}%)`;
            userElement.querySelector('.current-droplets').textContent = currentDroplets;
            userElement.querySelectorAll('.user-info > span').forEach(span => span.style.color = 'var(--success-color)');

            if (currentDroplets > 500) {
                userElement.querySelector('.current-droplets').textContent = (currentDroplets + currentCharges) % 500
                userElement.querySelector('.max-charges').textContent = data.user.charges.max + 5;
            }
        } catch (error) {
            console.error("Failed to update user element:", error);
        }
    }
});