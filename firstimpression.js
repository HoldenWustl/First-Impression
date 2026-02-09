import { storage, db } from "./firebase.js";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js";

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  limit,
  orderBy,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const USER_PHOTO_URL_KEY = "firstImpression_userPhotoURL";
const USER_PHOTO_ID_KEY = "firstImpression_userPhotoID";
const RATED_COUNT_KEY = "firstImpression_ratedCount";
// --- Tab Switching & State ---
let hasUploadedPhoto = false;

const profilePage = document.getElementById("profilePage");
const ratePage = document.getElementById("ratePage");
const tabProfile = document.getElementById("tabProfile");
const tabRate = document.getElementById("tabRate");

// Elements
const photoInput = document.getElementById("photoInput");
const photoPreview = document.getElementById("photoPreview");
const startRatingBtn = document.getElementById("startRatingBtn");
const ratedCountEl = document.getElementById("ratedCount");
let ratedCount = parseInt(localStorage.getItem(RATED_COUNT_KEY)) || 0;
const progressFill = document.getElementById("progressFill");
function checkRatingLimit() {
  const limitEl = document.getElementById("ratingLimit");
  // If we are ABOVE 10, hide the limit. Otherwise show it.
  if (limitEl) {
    if (ratedCount > 10) {
      limitEl.style.display = "none";
    } else {
      limitEl.style.display = "inline";
    }
  }
}
// --- 1. Startup Logic: Check for existing photo & Sync UI ---
(function startup() {
  const savedPhotoURL = localStorage.getItem(USER_PHOTO_URL_KEY);
  
  // A. Handle Photo/Rating Unlock
  if (savedPhotoURL) {
    setPhotoPreview(savedPhotoURL);
    unlockRating();
  } else {
    tabRate.style.opacity = "0.5";
    tabRate.style.cursor = "not-allowed";
    startRatingBtn.disabled = true;
  }

  // B. Sync the UI with the saved ratedCount
  // (Using the ratedCount variable already defined on line 144)
  if (ratedCountEl) {
    ratedCountEl.textContent = ratedCount;
    checkRatingLimit();
  }
  
  if (progressFill) {
    const progressPercent = Math.min((ratedCount / 10) * 100, 100);
    progressFill.style.width = `${progressPercent}%`;
  }

  // C. Instant Reveal: If they already hit 10, show results immediately
  if (ratedCount >= 10) {
    const preResults = document.getElementById("preResultsAction");
    const resultsCont = document.getElementById("resultsContainer");
    if (preResults && resultsCont) {
      preResults.classList.add("hidden");
      resultsCont.classList.remove("hidden");
      fetchMyResults();
    }
  }
})();

// --- Tab Handlers ---
tabProfile.onclick = () => switchTab("profile");
tabRate.onclick = () => {
  if (!hasUploadedPhoto) {
    // Optional: Shake animation or alert to tell user they must upload first
    tabProfile.classList.add("shake-animation"); // Assuming you have this class
    setTimeout(() => tabProfile.classList.remove("shake-animation"), 500);
    return;
  }
  switchTab("rate");
};

function switchTab(tab) {
  const isProfile = tab === "profile";
  
  profilePage.classList.toggle("active", isProfile);
  ratePage.classList.toggle("active", !isProfile);
  
  tabProfile.classList.toggle("active", isProfile);
  tabRate.classList.toggle("active", !isProfile);

  // --- CHECK FOR RESULTS UNLOCK ---
  if (isProfile && ratedCount >= 10) {
    document.getElementById("preResultsAction").classList.add("hidden");
    document.getElementById("resultsContainer").classList.remove("hidden");
    fetchMyResults(); // Grab latest score from Firestore
  }

  const activeContent = isProfile ? profilePage.querySelector('.card') : ratePage.querySelector('.card');
  activeContent.style.animation = 'none';
  void activeContent.offsetWidth; 
  activeContent.style.animation = 'juicyPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
}

// --- 2. Photo Upload Logic ---

photoPreview.onclick = () => photoInput.click();


photoInput.onchange = async () => {
  const file = photoInput.files[0];
  if (!file) return;

  try {
    photoPreview.innerHTML = '<div class="loader">Uploading...</div>'; 
    const photoRef = ref(storage, `photos/${crypto.randomUUID()}`);
    await uploadBytes(photoRef, file);
    const photoURL = await getDownloadURL(photoRef);
    
    localStorage.setItem(USER_PHOTO_URL_KEY, photoURL);

    // --- UPDATED: Save the docRef so we get the ID ---
    const docRef = await addDoc(collection(db, "photos"), {
      photoURL,
      createdAt: serverTimestamp(),
      ratingsCount: 0,
      averageRating: 0 
    });

    // Save the ID to localStorage
    localStorage.setItem(USER_PHOTO_ID_KEY, docRef.id);

    setPhotoPreview(photoURL);
    unlockRating();
  } catch (error) { console.error("Upload failed:", error);
    photoPreview.innerHTML = '<p>Error uploading. Try again.</p>'; }
};

// --- Helper: Render the preview image ---
function setPhotoPreview(url) {
  const img = document.createElement("img");
  img.src = url;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";

  photoPreview.innerHTML = "";
  photoPreview.appendChild(img);

  // JUICE 💦
  triggerUploadEffect();
}
function triggerUploadEffect() {
  photoPreview.classList.remove("pop", "ripple");

  // Force reflow so animation retriggers
  void photoPreview.offsetWidth;

  photoPreview.classList.add("pop", "ripple");

  // Sparkles
  for (let i = 0; i < 10; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";

    const angle = Math.random() * Math.PI * 2;
    const distance = 40 + Math.random() * 30;

    s.style.left = "50%";
    s.style.top = "50%";
    s.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    s.style.setProperty("--y", `${Math.sin(angle) * distance}px`);

    photoPreview.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

async function fetchMyResults() {
  const photoId = localStorage.getItem(USER_PHOTO_ID_KEY);
  if (!photoId) return;

  try {
    // 1. Fetch the Score
    const docRef = doc(db, "photos", photoId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const avg = data.averageRating || 0; // avg is defined here...

      // Update the text score
      const scoreEl = document.querySelector(".my-avg-rating");
      scoreEl.textContent = `${avg.toFixed(1)} / 10`;

      if (avg >= 7) scoreEl.style.color = "#4caf50";
      else if (avg >= 4) scoreEl.style.color = "#ff9800";
      else scoreEl.style.color = "#f44336";

      // --- GRAPH LOGIC MOVED INSIDE THE BLOCK ---
      const marker = document.getElementById("userMarker");
      const percentileText = document.getElementById("percentileText");

      if (marker) {
        const dot = marker.querySelector(".marker-dot");
        
        // Calculate Position
        let positionPercent = (avg / 10) * 100;
        positionPercent = Math.max(5, Math.min(95, positionPercent));
        marker.style.left = `${positionPercent}%`;

        // Color Coding
        let color = "#f44336";
        if (avg >= 7) color = "#4caf50";
        else if (avg >= 4) color = "#ff9800";
        dot.style.background = color;
        dot.style.boxShadow = `0 0 10px ${color}`;

        // Percentile Text
        const simplePercentile = Math.round((positionPercent) * 0.9 + 5);
        percentileText.innerHTML = `You are in the top <span style="color:${color}">${(100 - simplePercentile).toFixed(0)}%</span>`;

        if (avg < 0.1) { // Changed to 1 so people with low scores still see their placement
          percentileText.textContent = "Data is still being gathered...";
        }
      }
    } // ...avg dies here, but that's okay because we're done with it!

    // 2. Fetch the Messages (This stays outside the score check)
    const impressionsList = document.getElementById("impressionsList");
    impressionsList.innerHTML = '<div class="loader">Loading words...</div>';

    const ratingsQuery = query(
      collection(db, "ratings"),
      where("photoId", "==", photoId),
      orderBy("timestamp", "desc"),
      limit(50)
    );

    const querySnapshot = await getDocs(ratingsQuery);
    impressionsList.innerHTML = "";

    const words = [];
    querySnapshot.forEach((doc) => {
      const rData = doc.data();
      if (rData.word && rData.word.trim().length > 0) {
        words.push(rData.word.trim());
      }
    });

    if (words.length === 0) {
      impressionsList.innerHTML = '<p class="empty-impressions">No messages left yet.</p>';
    } else {
      words.forEach((word, index) => {
        const span = document.createElement("span");
        span.className = "word-tag";
        span.textContent = word;
        span.style.animationDelay = `${index * 50}ms`;
        impressionsList.appendChild(span);
      });
    }

  } catch (err) {
    console.error("Error fetching results:", err);
  }
}
// --- Helper: Unlock the app features ---
function unlockRating() {
  hasUploadedPhoto = true;
  
  // Enable button
  startRatingBtn.disabled = false;
  startRatingBtn.classList.add("armed");
  startRatingBtn.classList.remove("disabled"); // If you use a class for styling
  
  // Update Tab visuals
  tabRate.style.opacity = "1";
  tabRate.style.cursor = "pointer";
  
  // Optional: Change button text
  startRatingBtn.textContent = "Start Rating";
}

startRatingBtn.onclick = () => {
  if (hasUploadedPhoto) {
    switchTab("rate");
    if (photosToRate.length === 0) {
      loadPhotosToRate();
    }
  }
};

// --- 3. Rating Logic (Existing Code) ---
let photosToRate = []; // Will hold { id, photoURL } objects
let currentPhotoIndex = 0;

let isSubmitting = false; // The Gatekeeper
const rateImage = document.getElementById("rateImage");
const oneWordInput = document.getElementById("oneWordInput");
const submitRatingBtn = document.getElementById("submitRatingBtn");
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

async function loadPhotosToRate() {
  const userPhoto = localStorage.getItem(USER_PHOTO_URL_KEY);
  console.log("Checking for photos... My photo is:", userPhoto);

  // 1. Get ALL photos (we'll filter manually for now to avoid index issues)
  const q = query(collection(db, "photos"), limit(20));

  try {
    const querySnapshot = await getDocs(q);
    
    // 2. Filter out your own photo in JavaScript (easier for testing)
    photosToRate = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(photo => photo.photoURL !== userPhoto);

    shuffleArray(photosToRate);
    console.log("Filtered photos available to rate:", photosToRate.length);

    if (photosToRate.length > 0) {
      currentPhotoIndex = 0;
      renderPhoto(photosToRate[currentPhotoIndex]); 
    } else {
      // 3. FALLBACK: Show a mock if the DB is empty (Remove this for production)
      console.warn("Database empty or only contains your photo. Showing mock.");
      photosToRate = [{ id: "mock", photoURL: "https://picsum.photos/400/600" }];
      renderPhoto(photosToRate[0]);
    }
  } catch (err) {
    console.error("Firestore Load Error:", err);
  }
}

async function renderPhoto(photoObj) {
  if (!photoObj) return;

  return new Promise((resolve) => {
    // 1. Animate old photo out
    ratePhotoContainer.classList.add("exit");

    // 2. Preload new photo
    const tempImg = new Image();
    tempImg.src = photoObj.photoURL;

    tempImg.onload = () => {
      // 3. Swap src once loaded
      rateImage.src = tempImg.src;

      // 4. Animate new photo in
      ratePhotoContainer.classList.remove("exit");
      ratePhotoContainer.classList.add("enter");
      
      setTimeout(() => {
        ratePhotoContainer.classList.remove("enter");
        photoContainer.classList.remove('is-active');
photoContainer.style.boxShadow = "";
        resolve(); // tell the caller the photo is fully in
      }, 150);

      tempImg.onload = null;
    };
  });
}



// Update your submit logic to use these:
function displayNextPhoto() {
  currentPhotoIndex = (currentPhotoIndex + 1) % photosToRate.length;
  renderPhoto(photosToRate[currentPhotoIndex]);
}

// Update the Tab Switcher to trigger the load
tabRate.onclick = () => {
  if (!hasUploadedPhoto) return;
  if (photosToRate.length === 0) loadPhotosToRate(); // Load on first click
  switchTab("rate");
};

let selectedRating = null;
const photoRatingBadge = document.getElementById("photoRatingBadge");
const ratingButtons = document.querySelectorAll(".rating-btn");
const photoContainer = document.querySelector('.rate-photo');

ratingButtons.forEach(button => {
  button.addEventListener("click", () => {
    ratingButtons.forEach(b => b.classList.remove("selected"));
    button.classList.add("selected");

    selectedRating = button.dataset.value;
    if (!isSubmitting) {
    // Update badge text
    photoRatingBadge.textContent = selectedRating;
   const rotation = -15 + Math.random() * 30;
photoRatingBadge.style.setProperty("--badge-rotation", `${rotation}deg`);


    // Pull color from button CSS variable
    const color = getComputedStyle(button).getPropertyValue("--btn-color");
    photoRatingBadge.style.setProperty("--rating-color", color);
    photoContainer.style.setProperty('--accent-color', color);
photoContainer.classList.add('is-active');
photoContainer.style.boxShadow = `0 0 25px ${color}66`;
    // 🔥 Re-trigger pop animation
    photoRatingBadge.classList.remove("show");
    void photoRatingBadge.offsetWidth; // force reflow
    photoRatingBadge.classList.add("show");

    // ✨ Quick brightness punch
    photoRatingBadge.style.filter = "brightness(1.2)";
    setTimeout(() => {
      photoRatingBadge.style.filter = "";
    }, 120);}

    photoRatingBadge.classList.remove("hidden");
    submitRatingBtn.classList.add("armed");
  });
});




function createParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.backgroundColor = color || '#6c63ff';
    p.style.width = p.style.height = Math.random() * 8 + 4 + 'px';
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    
    // Random direction
    const tx = (Math.random() - 0.5) * 200;
    const ty = (Math.random() - 0.5) * 200;
    p.style.setProperty('--tx', `${tx}px`);
    p.style.setProperty('--ty', `${ty}px`);
    
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 600);
  }
}

// Grab the container
const ratePhotoContainer = document.querySelector(".rate-photo");

submitRatingBtn.onclick = async (e) => {
  if (isSubmitting || !selectedRating || photosToRate.length === 0) return;
  isSubmitting = true;
  submitRatingBtn.disabled = true;

  const currentPhoto = photosToRate[currentPhotoIndex];
  const ratingValue = Number(selectedRating);
  const color = getComputedStyle(photoRatingBadge).getPropertyValue("--rating-color");
  const userWord = oneWordInput.value.trim(); 

  createParticles(e.clientX, e.clientY, color);
  submitRatingBtn.classList.add("submitted");

  try {
    const photoRef = doc(db, "photos", currentPhoto.id);
    
    const [newAverage, recentRatingsSnap, _] = await Promise.all([
      // Task A: Transaction
      runTransaction(db, async (transaction) => {
        const photoDoc = await transaction.get(photoRef);
        if (!photoDoc.exists()) throw "Photo does not exist!";
        const data = photoDoc.data();
        const currentAvg = data.averageRating || 0;
        const currentCount = data.ratingsCount || 0;
        const newCount = currentCount + 1;
        const calculatedAvg = ((currentAvg * currentCount) + ratingValue) / newCount;
        transaction.update(photoRef, { averageRating: calculatedAvg, ratingsCount: newCount });
        return calculatedAvg;
      }),

      // Task B: Fetch recent ratings (Fetch 10, filter in JS to avoid Index errors)
      getDocs(query(
        collection(db, "ratings"),
        where("photoId", "==", currentPhoto.id),
        orderBy("timestamp", "desc"),
        limit(10) 
      )),

      // Task C: Save new rating
      addDoc(collection(db, "ratings"), {
        photoId: currentPhoto.id,
        rating: ratingValue,
        word: userWord,
        timestamp: serverTimestamp()
      })
    ]);

    // --- 3. Process Words (Logic Update) ---
    let displayWords = [];
    
    // 1. Add current user word first
    if(userWord) displayWords.push(userWord);

    // 2. Add words from DB (Filter duplicates & empty strings)
    recentRatingsSnap.forEach(doc => {
        const w = doc.data().word;
        // Check if word exists, isn't empty, and isn't a duplicate
        if(w && w.trim().length > 0 && !displayWords.includes(w)) {
            displayWords.push(w);
        }
    });

    // 3. STRICT LIMIT: Ensure we never send more than 3
    displayWords = displayWords.slice(0, 3);

    // 4. Animate
    await showAveragePop(newAverage, color, displayWords);

    // --- (Rest of logic) ---
    currentPhotoIndex = (currentPhotoIndex + 1) % photosToRate.length;
    await renderPhoto(photosToRate[currentPhotoIndex]);

    ratedCount++;
    localStorage.setItem(RATED_COUNT_KEY, ratedCount);
    ratedCountEl.textContent = ratedCount;
    checkRatingLimit();
    const progressPercent = Math.min((ratedCount / 10) * 100, 100);
    progressFill.style.width = `${progressPercent}%`;

    photoRatingBadge.classList.remove("show", "pop-in");
    oneWordInput.value = "";
    selectedRating = null;
    ratingButtons.forEach(b => b.classList.remove("selected"));
    submitRatingBtn.classList.remove("armed", "submitted");

  } catch (err) {
    console.error("Error saving rating:", err);
  } finally {
    isSubmitting = false;
    submitRatingBtn.disabled = false;
    if(navigator.vibrate) navigator.vibrate(10);
  }
};

// Helper for the "Juicy" Count-up
function showAveragePop(avg, color, words = []) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("average-overlay");
    const textEl = overlay.querySelector(".avg-number");
    const wordsContainer = document.getElementById("avg-words-container"); 
    
    // Clear previous words
    wordsContainer.innerHTML = "";
    
    overlay.style.color = color;
    overlay.classList.add("active");

    // 1. Number Animation (Standard)
    const startTime = performance.now();
    const duration = 600; 

    function updateNumber(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      textEl.textContent = (progress * avg).toFixed(1);
      if (progress < 1) requestAnimationFrame(updateNumber);
    }
    requestAnimationFrame(updateNumber);

    // 2. Words Animation (Staggered)
    if(words.length > 0) {
        setTimeout(() => {
            words.forEach((word, index) => {
                const pill = document.createElement("div");
                pill.className = "avg-word-pill";
                pill.textContent = word;
                // Add a border matching the rating color
                pill.style.border = `2px solid ${color}`;
                pill.style.animationDelay = `${index * 150}ms`;
                
                wordsContainer.appendChild(pill);
                
                // Force Reflow
                void pill.offsetWidth;
                pill.classList.add("pop");
            });
        }, 200);
    }

    // 3. Cleanup
    setTimeout(() => {
      overlay.classList.remove("active");
      // Fade out words manually or just clear innerHTML
      wordsContainer.innerHTML = ""; 
      resolve();
    }, 2000); // 2 seconds total display time
  });
}


// --- Privacy Modal Logic ---
const privacyBtn = document.getElementById("privacyBtn");
const privacyModal = document.getElementById("privacyModal");
const closePrivacyBtn = document.getElementById("closePrivacyBtn");

if(privacyBtn) {
    privacyBtn.onclick = () => {
        privacyModal.classList.remove("hidden");
    };
}

if(closePrivacyBtn) {
    closePrivacyBtn.onclick = () => {
        privacyModal.classList.add("hidden");
    };
}

if(privacyModal) {
    privacyModal.onclick = (e) => {
        if (e.target === privacyModal) {
            privacyModal.classList.add("hidden");
        }
    };
}

// --- Floating Indicator Logic ---
const indicator = document.getElementById('ratingIndicator');
const container = document.getElementById('ratingGrid');

if (container && indicator) {
    ratingButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        // UI Classes handled in previous loop
        indicator.classList.add('active');

        // Position Math
        const btnRect = this.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const x = (btnRect.left - containerRect.left) + (btnRect.width / 2) - 8; 
        const y = -(btnRect.height + 5); 

        indicator.style.transform = `translateX(${x}px) translateY(${y}px)`;
        
        const btnColor = getComputedStyle(this).getPropertyValue('--btn-color');
        if(btnColor) {
            indicator.style.backgroundColor = btnColor;
        }
      });
    });
}
