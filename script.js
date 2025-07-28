
let firebaseEnable = true;


let gameRef = null;
let playerNumber = null;

let gameId = new URLSearchParams(window.location.search).get("game");

if (!gameId) {
    gameId = prompt("Enter a Game ID to join or type 'offline' for local mode:")?.trim().toLowerCase();

    if (gameId === "offline") {
        firebaseEnable = false;
    } else if (gameId) {
        firebaseEnable = true;
        window.history.replaceState(null, "", "?game=" + encodeURIComponent(gameId));
    }
}

if (firebaseEnable) {
    gameRef = firebase.database().ref("games/" + gameId);

    playerNumber = null;

    // Assign Player 1 or 2
    gameRef.child("players").once("value", snapshot => {
        const players = snapshot.val() || {};
        if (!players.player1) {
            playerNumber = 1;
            const playerRef = gameRef.child("players/player1");
            playerRef.set(true);
            playerRef.onDisconnect().remove();
        } else if (!players.player2) {
            playerNumber = 2;
            const playerRef = gameRef.child("players/player2");
            playerRef.set(true);
            playerRef.onDisconnect().remove();
        } else {
            alert("Game is full.");
        }
    });
}

let stat = 'puzzle';
let currentSolution = null;

if (firebaseEnable) {
    gameRef.child("puzzle").on("value", snapshot => {
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
        gameRef.child("moves").remove();
        gameRef.child("puzzle").remove();
        gameRef.child("status").set("in_progress");
    }


    fetch('https://sudoku-api.vercel.app/api/dosuku')
        .then(response => response.json())
        .then(data => {
            const gridData = data.newboard.grids[0];
            const puzzle = gridData.value;
            const difficulty = gridData.difficulty || 'Unknown';

            currentSolution = gridData.solution;
            // stat = 'puzzle';

            if (firebaseEnable) {
                gameRef.child("puzzle").set({
                    value: puzzle,
                    solution: currentSolution,
                    difficulty: difficulty
                });
            }

            if (!firebaseEnable) {
                stat = 'puzzle';

                displaySudokuGrid(puzzle);
                showButton();
                addInputListeners();

                document.getElementById('z').textContent = `Difficulty: ${difficulty || 'Unknown'}`;
            }

        })
        .catch(error => {
            document.getElementById('output').textContent = "Error. See Console.";
            console.error(error);
        });
}


function displaySudokuGrid(grid) {
    let html = '<table>';
    for (let i = 0; i < 9; i++) {
        html += '<tr>';
        for (let j = 0; j < 9; j++) {
            const value = grid[i][j];
            const isPreFilled = value !== 0;

            // Determine class names for borders
            const classes = [];
            if (i % 3 === 0) classes.push('thick-border-top');
            if (i === 8) classes.push('thick-border-bottom');
            if (j % 3 === 0) classes.push('thick-border-left');
            if (j === 8) classes.push('thick-border-right');

            // Add cell-type-specific class
            classes.push(isPreFilled ? 'readonly-cell-td' : 'editable-cell-td');

            html += `<td class="${classes.join(' ')}">
                <input 
                    type="text" 
                    maxlength="1"
                    data-row="${i}" 
                    data-col="${j}"
                    value="${isPreFilled ? value : ''}" 
                    ${isPreFilled ? 'readonly' : ''}
                    class="${isPreFilled ? 'readonly-cell' : 'editable-cell'}"
                />
            </td>`;
        }
        html += '</tr>';
    }
    html += '</table>';
    document.getElementById('output').innerHTML = html;
    
    if (typeof firebaseEnable !== 'undefined' && firebaseEnable) {
        listenForMoves();
    }
}


//listenForMoves()
if (firebaseEnable) {
    function listenForMoves() {
        const movesRef = gameRef.child("moves");

        // For new entries
        movesRef.on("child_added", updateInput);

        // For changed entries (e.g. overwriting a move)
        movesRef.on("child_changed", updateInput);

        // For removed entries (deleting a number)
        movesRef.on("child_removed", snapshot => {
            const [row, col] = snapshot.key.split("_").map(Number);
            const input = document.querySelector(`input[data-row="${row}"][data-col="${col}"]`);
            if (input) {
                input.value = '';
                input.style.backgroundColor = '';
                input.style.color = '';
            }
        });
    }
}

//updateInput()
if (firebaseEnable) {
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
}


function addInputListeners() {
    const inputs = document.querySelectorAll('#output input:not([readonly])');
    inputs.forEach(input => {
        input.addEventListener('input', onInputChange);
    });
}

// Live input checking function
function onInputChange(e) {
    const input = e.target;
    const val = input.value.trim();

    const row = parseInt(input.dataset.row, 10);
    const col = parseInt(input.dataset.col, 10);

    if (val === '' || !/^[1-9]$/.test(val)) {
        input.value = '';
        if (firebaseEnable) { gameRef.child("moves").child(`${row}_${col}`).remove(); } // Sync deletion 
        return;
    }

    if (firebaseEnable) {
        gameRef.child("moves").child(`${row}_${col}`).set({
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
    // Optionally, remove input listeners to prevent further changes or keep them to allow correction
}

document.getElementById('completion-overlay').addEventListener('click', () => {
    document.getElementById('completion-overlay').style.display = 'none';
});


function showButton() {
    const buttonContainer = document.getElementById('buttons');
    buttonContainer.innerHTML = ''; // Clear old buttons

    // Show Solution / Get New Puzzle button (existing)
    const toggleButton = document.createElement('button');
    toggleButton.className = 'btn btn-success me-2';

    // if (stat === 'puzzle') {
    //     toggleButton.textContent = 'Show Solution';
    //     toggleButton.disabled = true;
    //     toggleButton.onclick = () => {
    //         displaySudokuGrid(currentSolution);
    //         stat = 'solution';
    //         showButton();
    //     };
    // } else {
    //     toggleButton.textContent = 'Get New Puzzle';
    //     toggleButton.onclick = () => {
    //         getSudoku();
    //     };
    // }
    // buttonContainer.appendChild(toggleButton);

    // New button: Check Current Solution
    if (stat === 'puzzle') {
        const checkButton = document.createElement('button');
        checkButton.className = 'btn btn-primary';
        checkButton.textContent = 'Check Solution';
        checkButton.onclick = checkSolution;
        buttonContainer.appendChild(checkButton);
    }
}

// Check the entire grid for correctness on button click
function checkSolution() {
    const inputs = document.querySelectorAll('#output input');
    let allCorrect = true;

    inputs.forEach(input => {
        const row = parseInt(input.dataset.row, 10);
        const col = parseInt(input.dataset.col, 10);
        const val = input.value.trim();

        if (val === '') {
            // Empty cell - treat as incorrect
            input.style.backgroundColor = '#f8d7da';
            input.style.color = '#721c24';
            allCorrect = false;
            return;
        }

        const correctVal = currentSolution[row][col];
        if (val != correctVal) {
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
        if (firebaseEnable) { gameRef.child("status").set("completed"); }
    } else {
        alert('Some numbers are incorrect or missing. Please fix them.');
    }
}

if (firebaseEnable && gameRef) {
    gameRef.child("status").on("value", snapshot => {
        if (snapshot.val() === "completed") {
            showCompletionOverlay();
        }
    })
}

if (!firebaseEnable) {
    const note = document.createElement("p");
    note.className = "text-center text-danger";
    note.textContent = "⚠ Running in Local Mode - Multiplayer is disabled";
    document.querySelector('.container').appendChild(note);
}




