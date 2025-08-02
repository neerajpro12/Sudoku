let firebaseEnable = true;

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
    getDatabase, ref, onValue, set, remove, onDisconnect, get, child
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDJKG8sWnJDzEKR5zcyT6z9kzOwu1jEnCI",
    authDomain: "sudoku-mp2.firebaseapp.com",
    databaseURL: "https://sudoku-mp2-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "sudoku-mp2",
    storageBucket: "sudoku-mp2.firebasestorage.app",
    messagingSenderId: "582727244145",
    appId: "1:582727244145:web:da1831cd0d01a9d89abed0"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let gameRef = null;
let playerNumber = null;

let gameId = new URLSearchParams(window.location.search).get("game");

if (!gameId) {
    gameId = prompt("Enter a Game ID to join or type 'offline' for Single Player mode:")?.trim().toLowerCase();

    if (gameId === "offline") {
        firebaseEnable = false;
    } else if (gameId) {
        firebaseEnable = true;
        window.history.replaceState(null, "", "?game=" + encodeURIComponent(gameId));
    } else {
        alert("No Game ID entered. Running in Single Player Mode.");
        firebaseEnable = false;
    }
}

if (firebaseEnable && gameId) {
    gameRef = ref(db, "games/" + gameId);

    // Assign Player 1 or 2
    get(child(gameRef, "players")).then(snapshot => {
        const players = snapshot.val() || {};
        if (!players.player1) {
            playerNumber = 1;
            const playerRef = ref(db, `games/${gameId}/players/player1`);
            set(playerRef, true);
            onDisconnect(playerRef).remove();
        } else if (!players.player2) {
            playerNumber = 2;
            const playerRef = ref(db, `games/${gameId}/players/player2`);
            set(playerRef, true);
            onDisconnect(playerRef).remove();
        } else {
            alert("Game is full.");
        }
    });
}

let stat = 'puzzle';
let currentSolution = null;

if (firebaseEnable && gameRef) {
    onValue(ref(db, `games/${gameId}/puzzle`), snapshot => {
        const data = snapshot.val();
        if (data) {
            currentSolution = data.solution;
            stat = 'puzzle';

            displaySudokuGrid(data.value);
            showButton();
            addInputListeners();

            document.getElementById('z').textContent = `Difficulty: ${data.difficulty || 'Unknown'}`;
        }
    });
}

function getSudoku() {
    if (firebaseEnable) {
        if (playerNumber !== 1) {
            alert("You can't generate a puzzle!");
            return;
        }
        remove(ref(db, `games/${gameId}/moves`));
        remove(ref(db, `games/${gameId}/puzzle`));
        set(ref(db, `games/${gameId}/status`), "in_progress");
    }

    fetch('https://sudoku-api.vercel.app/api/dosuku')
        .then(res => res.json())
        .then(data => {
            const gridData = data.newboard.grids[0];
            const puzzle = gridData.value;
            const difficulty = gridData.difficulty || 'Unknown';
            currentSolution = gridData.solution;

            if (firebaseEnable) {
                set(ref(db, `games/${gameId}/puzzle`), {
                    value: puzzle,
                    solution: currentSolution,
                    difficulty
                });
            } else {
                stat = 'puzzle';
                displaySudokuGrid(puzzle);
                showButton();
                addInputListeners();
                document.getElementById('z').textContent = `Difficulty: ${difficulty}`;
            }
        })
        .catch(err => {
            document.getElementById('output').textContent = "Error. See Console.";
            console.error(err);
        });
}

function displaySudokuGrid(grid) {
    let html = '<table>';
    for (let i = 0; i < 9; i++) {
        html += '<tr>';
        for (let j = 0; j < 9; j++) {
            const value = grid[i][j];
            const isPreFilled = value !== 0;
            const classes = [];
            if (i % 3 === 0) classes.push('thick-border-top');
            if (i === 8) classes.push('thick-border-bottom');
            if (j % 3 === 0) classes.push('thick-border-left');
            if (j === 8) classes.push('thick-border-right');
            classes.push(isPreFilled ? 'readonly-cell-td' : 'editable-cell-td');

            html += `<td class="${classes.join(' ')}">
        <input type="text" maxlength="1"
          data-row="${i}" data-col="${j}"
          value="${isPreFilled ? value : ''}"
          ${isPreFilled ? 'readonly' : ''}
          class="${isPreFilled ? 'readonly-cell' : 'editable-cell'}" />
      </td>`;
        }
        html += '</tr>';
    }
    html += '</table>';
    document.getElementById('output').innerHTML = html;

    if (firebaseEnable) {
        listenForMoves();
    }
}

function listenForMoves() {
    const movesRef = ref(db, `games/${gameId}/moves`);

    onValue(movesRef, snapshot => {
        snapshot.forEach(childSnapshot => {
            updateInput(childSnapshot);
        });
    });

    // Listen for removed moves (not directly supported by onValue)
    // Alternative: Use child_removed separately if needed
    // You can add onChildRemoved if you want exact behavior like before.
}

function updateInput(snapshot) {
    const [row, col] = snapshot.key.split("_").map(Number);
    const data = snapshot.val();
    const input = document.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
    if (input) {
        input.value = data.value;
        input.style.backgroundColor = playerNumber === data.player ? "#e0f7fa" : "#ffe0b2";
        input.style.color = "#000";
    }
}

function addInputListeners() {
    document.querySelectorAll('#output input:not([readonly])').forEach(input => {
        input.addEventListener('input', onInputChange);
    });
}

function onInputChange(e) {
    const input = e.target;
    const val = input.value.trim();
    const row = parseInt(input.dataset.row, 10);
    const col = parseInt(input.dataset.col, 10);

    if (val === '' || !/^[1-9]$/.test(val)) {
        input.value = '';
        if (firebaseEnable) remove(ref(db, `games/${gameId}/moves/${row}_${col}`));
        return;
    }

    if (firebaseEnable) {
        set(ref(db, `games/${gameId}/moves/${row}_${col}`), {
            value: val,
            player: playerNumber
        });
    }
}

function isPuzzleComplete() {
    const inputs = document.querySelectorAll('#output input');
    for (const input of inputs) {
        const row = parseInt(input.dataset.row, 10);
        const col = parseInt(input.dataset.col, 10);
        const val = input.value.trim();
        if (val === '' || val != currentSolution[row][col]) {
            return false;
        }
    }
    return true;
}

function showCompletionOverlay() {
    const overlay = document.getElementById('completion-overlay');
    overlay.style.display = 'flex';
}

document.getElementById('completion-overlay').addEventListener('click', () => {
    document.getElementById('completion-overlay').style.display = 'none';
});

function showButton() {
    const container = document.getElementById('buttons');
    container.innerHTML = '';

    if (stat === 'puzzle') {
        const checkBtn = document.createElement('button');
        checkBtn.className = 'btn btn-primary';
        checkBtn.textContent = 'Check Solution';
        checkBtn.onclick = checkSolution;
        container.appendChild(checkBtn);
    }
}

function checkSolution() {
    let allCorrect = true;
    document.querySelectorAll('#output input').forEach(input => {
        const row = parseInt(input.dataset.row, 10);
        const col = parseInt(input.dataset.col, 10);
        const val = input.value.trim();
        if (val === '') {
            input.style.backgroundColor = '#f8d7da';
            input.style.color = '#721c24';
            allCorrect = false;
            return;
        }
        if (val != currentSolution[row][col]) {
            input.style.backgroundColor = '#f8d7da';
            input.style.color = '#721c24';
            allCorrect = false;
        } else {
            input.style.backgroundColor = '';
            input.style.color = '';
        }
    });

    if (allCorrect) {
        alert('Congratulations! All numbers are correct!');
        if (firebaseEnable) set(ref(db, `games/${gameId}/status`), "completed");
    } else {
        alert('Some numbers are incorrect or missing. Please fix them.');
    }
}

if (firebaseEnable && gameRef) {
    onValue(ref(db, `games/${gameId}/status`), snapshot => {
        if (snapshot.val() === "completed") {
            showCompletionOverlay();
        }
    });
}

if (!firebaseEnable) {
    const note = document.createElement("p");
    note.className = "text-center text-danger";
    note.textContent = "⚠ Running in Single Player Mode - Multiplayer is disabled";
    document.querySelector('.container').appendChild(note);
}

window.getSudoku = getSudoku;

let keyBuffer = '';

document.addEventListener('keydown', (e) => {
  // Ignore key presses inside inputs/textareas
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();  // Prevent digit from being typed anywhere

    keyBuffer += e.key;
    if (keyBuffer.length === 2) {
      const row = parseInt(keyBuffer[0], 10) -1;;
      const col = parseInt(keyBuffer[1], 10) -1;;
      keyBuffer = '';

      // Find the input and focus it if exists
      const input = document.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
      if (input) {
        input.focus();
      }
    }
  } else {
    // Reset buffer on non-digit keys
    keyBuffer = '';
  }
});
