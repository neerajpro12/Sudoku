let gameId = new URLSearchParams(window.location.search).get("game");
if (!gameId) {
    gameId = prompt("Enter a Game ID to join or create:");
    window.location.search = "?game=" + gameId;
}
const gameRef = firebase.database().ref("games/" + gameId);

let playerNumber = null;

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

let stat = 'puzzle';
let currentSolution = null;

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

function getSudoku() {
    if (playerNumber !== 1) {
        alert("You can't generate a puzzle!");
        return;
    }
    gameRef.child("moves").remove();
    gameRef.child("puzzle").remove();
    gameRef.child("status").set("in_progress");


    fetch('https://sudoku-api.vercel.app/api/dosuku')
        .then(response => response.json())
        .then(data => {
            const gridData = data.newboard.grids[0];
            const puzzle = gridData.value;
            const difficulty = gridData.difficulty || 'Unknown';

            currentSolution = gridData.solution;
            // stat = 'puzzle';

            gameRef.child("puzzle").set({
                value: puzzle,
                solution: currentSolution,
                difficulty: difficulty
            });

            // displaySudokuGrid(puzzle);
            // showButton();
            // addInputListeners();

            // document.getElementById('z').textContent = `Difficulty: ${difficulty}`;


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

            // Add thick borders for 3x3 blocks
            const classes = [];
            if (i % 3 === 0) classes.push('thick-border-top');
            if (i === 8) classes.push('thick-border-bottom');
            if (j % 3 === 0) classes.push('thick-border-left');
            if (j === 8) classes.push('thick-border-right');

            html += `<td class="${classes.join(' ')}">
                    <input 
                        type="text" 
                        maxlength="1"
                        data-row="${i}" data-col="${j}"
                        value="${isPreFilled ? value : ''}" 
                        ${isPreFilled ? 'readonly' : ''}
                        class="${isPreFilled ? 'readonly-cell' : ''}"
                    />
                </td>`;
        }
        html += '</tr>';
    }
    html += '</table>';
    console.log(html);
    document.getElementById('output').innerHTML = html;
    listenForMoves();
}

function listenForMoves() {
    gameRef.child("moves").on("child_added", snapshot => {
        const [row, col] = snapshot.key.split("_").map(Number);
        const data = snapshot.val();
        const input = document.querySelector(`input[data-row="${row}"][data-col="${col}"]`);

        if (input) {
            input.value = data.value;
            input.style.backgroundColor = playerNumber === data.player ? "#e0f7fa" : "#ffe0b2";
            input.style.color = "#000";
        }

    });
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

    if (!/^[1-9]$/.test(val)) {
        input.value = '';
        return;
    }

    const row = parseInt(input.dataset.row, 10);
    const col = parseInt(input.dataset.col, 10);

    gameRef.child("moves").child(`${row}_${col}`).set({
        value: val,
        player: playerNumber
    });

    // if (isPuzzleComplete()) {
    //     gameRef.child("status").set("completed");
    // }
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

    if (stat === 'puzzle') {
        toggleButton.textContent = 'Show Solution';
        toggleButton.disabled = true;
        toggleButton.onclick = () => {
            displaySudokuGrid(currentSolution);
            stat = 'solution';
            showButton();
        };
    } else {
        toggleButton.textContent = 'Get New Puzzle';
        toggleButton.onclick = () => {
            getSudoku();
        };
    }
    buttonContainer.appendChild(toggleButton);

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
        gameRef.child("status").set("completed");
    } else {
        alert('Some numbers are incorrect or missing. Please fix them.');
    }
}

gameRef.child("status").on("value", snapshot => {
    if (snapshot.val() === "completed") {
        showCompletionOverlay();
    }
})