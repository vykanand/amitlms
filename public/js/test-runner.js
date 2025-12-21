// Test Runner JavaScript - Fixed to work with Professional UI
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const testId = urlParams.get('testId');

    if (!testId) {
        alert('Invalid test ID');
        return;
    }

    let autoSaveTimer = null;
    let currentQuestionIndex = 0; // Initialize at top level
    let sessionData = {};
    let testData = {};
    let userData = {};

    function autoSaveSession() {
        // Clear existing timer
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
        }

        // Set new timer to save after 2 seconds of inactivity
        autoSaveTimer = setTimeout(() => {
            console.log('Auto-saving session...');
            saveSessionData();
        }, 2000);
    }

    // Get user data from localStorage
    const userString = localStorage.getItem('user');
    if (userString) {
        try {
            userData = JSON.parse(userString);
        } catch (e) {
            console.error('Error parsing user data:', e);
        }
    }

    if (!userData || !userData.phone) {
        alert('User not logged in. Please login first.');
        window.location.href = 'studentlogin.html';
        return;
    }

    // Display user info
    displayUserInfo();

    // Load test data and session data together
    Promise.all([
        fetch(`/api/tests/${testId}`).then(response => response.json()),
        fetch(`/api/user/testsession?phone=${userData.phone}`).then(response => response.json())
    ])
    .then(([testDataResponse, sessionResponse]) => {
        testData = testDataResponse;

        // Load session data
        if (sessionResponse[testId]) {
            sessionData = sessionResponse[testId];
            currentQuestionIndex = sessionData.currentIndex || 0;
            // Ensure progress fields exist and are accurate
            if (sessionData.answered === undefined || sessionData.total === undefined) {
                updateSessionProgress();
            }

            // Check if test is already completed
            if (sessionData.completed) {
                // Show detailed report immediately for completed tests
                updateTestInfo();
                renderQuestion();
                renderNavigation();
                updateProgress();
                hideLoading();
                showDetailedReport();
                return;
            }

            // Check if there are any answers saved
            const hasAnswers = Object.keys(sessionData.answers || {}).length > 0;
            if (hasAnswers) {
                // Show resume modal
                updateTestInfo();
                hideLoading();
                showResumeModal();
                return;
            }
        } else {
            // Initialize new session for this test
            sessionData = {
                answers: {},
                currentIndex: 0,
                answered: 0,
                total: testData?.questions?.length || 0,
                completed: false
            };
            currentQuestionIndex = 0; // Ensure currentQuestionIndex is set
            // Save initial session
            saveSessionData();
        }

        updateTestInfo();
        renderQuestion();
        renderNavigation();
        updateProgress();
        hideLoading();
    })
    .catch(error => {
        console.error('Error loading test or session:', error);
        alert('Failed to load test. Please try again.');
    });

    function displayUserInfo() {
        if (!userData) return;

        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = userData.phone || 'Student';
        }

        // Add click handler for user profile dropdown
        const userProfile = document.querySelector('.user-profile');
        const userDropdown = document.getElementById('user-dropdown');
        const userMenuBtn = document.getElementById('user-menu-btn');

        if (userProfile && userDropdown) {
            const toggleDropdown = (e) => {
                e.stopPropagation();
                const isVisible = userDropdown.style.display !== 'none';
                userDropdown.style.display = isVisible ? 'none' : 'block';

                // Close dropdown when clicking outside
                if (!isVisible) {
                    document.addEventListener('click', function closeDropdown(event) {
                        if (!userProfile.contains(event.target)) {
                            userDropdown.style.display = 'none';
                            document.removeEventListener('click', closeDropdown);
                        }
                    });
                }
            };

            userProfile.addEventListener('click', toggleDropdown);
            if (userMenuBtn) {
                userMenuBtn.addEventListener('click', toggleDropdown);
            }
        }

        // Add dropdown item handlers
        const profileItem = document.getElementById('profile-item');
        const logoutItem = document.getElementById('logout-item');

        if (profileItem) {
            profileItem.addEventListener('click', () => {
                saveSessionData();
                globalThis.location.href = 'studentdashboard.html';
            });
        }

        if (logoutItem) {
            logoutItem.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('user');
                    globalThis.location.href = 'studentlogin.html';
                }
                userDropdown.style.display = 'none';
            });
        }
    }

    function evaluateTest() {
        if (!testData?.questions) return { correct: 0, total: 0, score: 0, descriptiveCount: 0 };

        let correctMCQ = 0;
        let totalMCQ = 0;
        let descriptiveCount = 0;
        let totalScore = 0;

        testData.questions.forEach((question, index) => {
            const userAnswer = sessionData.answers[index];

            if (question.type === 'mcq') {
                totalMCQ++;
                // Check if answer is correct
                if (userAnswer && question.correct && userAnswer.toLowerCase() === question.correct.toLowerCase()) {
                    correctMCQ++;
                    totalScore += 1; // 1 point per correct MCQ
                }
            } else if (question.type === 'desc') {
                descriptiveCount++;
                // For descriptive questions, check if admin has graded it
                if (sessionData.descriptiveScores && sessionData.descriptiveScores[index] !== undefined) {
                    totalScore += sessionData.descriptiveScores[index];
                }
                // If not graded yet, don't add to score but count as attempted
            }
        });

        return {
            correct: correctMCQ,
            total: totalMCQ,
            score: totalScore,
            descriptiveCount: descriptiveCount,
            totalPossibleScore: totalMCQ + descriptiveCount // Assuming descriptive questions are worth 1 point each
        };
    }

    function updateSessionProgress() {
        if (!testData?.questions) return;

        const answeredCount = Object.values(sessionData.answers).filter(answer =>
            answer !== undefined && answer !== null && answer !== ''
        ).length;

        sessionData.answered = answeredCount;
        sessionData.total = testData.questions.length;
    }

    function saveSessionData() {
        // Update progress before saving
        updateSessionProgress();

        const fullSession = {};
        fullSession[testId] = sessionData;

        fetch('/api/user/testsession', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: userData.phone,
                testsession: fullSession
            })
        })
        .then(response => {
            if (!response.ok) {
                console.error('Failed to save session:', response.status);
            } else {
                console.log('Session saved successfully');
            }
        })
        .catch(error => {
            console.error('Error saving session:', error);
        });
    }

    function updateTestInfo() {
        if (!testData) return;

        const titleElement = document.getElementById('test-title');
        if (titleElement) {
            titleElement.textContent = testData.title || 'Test';
        }

        // Question count will be updated by updateProgress function
    }

    function renderQuestion() {
        if (!testData?.questions) return;

        const question = testData.questions[currentQuestionIndex];
        if (!question) return;

        // Update question number
        const questionNumberElement = document.querySelector('.question-number');
        if (questionNumberElement) {
            questionNumberElement.textContent = `Q${currentQuestionIndex + 1}`;
        }

        // Update question type
        const questionTypeElement = document.getElementById('question-type');
        if (questionTypeElement) {
            questionTypeElement.textContent = question.type === 'mcq' ? 'Multiple Choice' : 'Descriptive';
        }

        // Update question text
        const questionTextElement = document.getElementById('question-text');
        if (questionTextElement) {
            questionTextElement.textContent = question.text || question.question || '';
        }

        // Update options
        renderOptions(question);

        // Update guidelines
        renderGuidelines(question);
            // Update hint UI visibility based on whether the question has been attempted
            updateHintVisibility(currentQuestionIndex);
    }

        // Returns true if the question at `index` has been attempted by the user
        function isQuestionAttempted(index) {
            if (!testData?.questions) return false;
            const q = testData.questions[index];
            const ans = sessionData.answers && sessionData.answers[index];
            if (!q) return false;
            if (q.type === 'mcq') {
                return ans !== undefined && ans !== '';
            }
            if (q.type === 'desc') {
                return ans !== undefined && ans !== null && String(ans).trim() !== '';
            }
            return false;
        }

        // Show the hint toggle only after the question is attempted. Hint content is prepared
        // whenever the question has a `hint` property, but the toggle remains hidden until attempt.
        function updateHintVisibility(index) {
            try {
                const hintToggle = document.getElementById('hint-toggle');
                const hintText = document.getElementById('hint-text');
                if (!hintToggle || !hintText) return;

                const q = testData?.questions?.[index];
                if (!q || !q.hint) {
                    hintToggle.style.display = 'none';
                    hintText.style.display = 'none';
                    hintText.innerHTML = '';
                    hintToggle.onclick = null;
                    return;
                }

                // Prepare hint content and attributes
                hintText.innerHTML = q.hint;
                hintToggle.innerHTML = '<i class="fas fa-info-circle"></i>';
                hintToggle.title = 'Show hint';
                hintToggle.setAttribute('aria-expanded', 'false');

                if (isQuestionAttempted(index)) {
                    hintToggle.style.display = 'inline-block';
                    hintText.style.display = 'none';
                    hintToggle.onclick = () => {
                        const isVisible = hintText.style.display !== 'none';
                        hintText.style.display = isVisible ? 'none' : 'block';
                        hintToggle.title = isVisible ? 'Show hint' : 'Hide hint';
                        hintToggle.setAttribute('aria-expanded', String(!isVisible));
                    };
                } else {
                    // Hide hint until the question is attempted
                    hintToggle.style.display = 'none';
                    hintText.style.display = 'none';
                    hintToggle.onclick = null;
                }
            } catch (e) {
                console.error('Hint visibility error', e);
            }
        }

    function renderOptions(question) {
        const optionsContainer = document.getElementById('options-container');
        if (!optionsContainer) return;

        optionsContainer.innerHTML = '';

        if (question.type === 'mcq') {
            for (const option of ['a', 'b', 'c', 'd']) {
                if (question[option]) {
                    const optionLetter = option.toUpperCase();
                    const isSelected = sessionData.answers[currentQuestionIndex] === option;

                    const optionDiv = document.createElement('div');
                    optionDiv.className = `option-item ${isSelected ? 'selected' : ''}`;
                    optionDiv.innerHTML = `
                        <div class="option-radio"></div>
                        <div class="option-label">
                            <strong>${optionLetter}.</strong> ${question[option]}
                        </div>
                    `;

                    optionDiv.addEventListener('click', () => {
                        selectOption(option);
                    });

                    optionsContainer.appendChild(optionDiv);
                }
            }
        } else if (question.type === 'desc') {
            const currentAnswer = sessionData.answers[currentQuestionIndex] || '';
            const textarea = document.createElement('textarea');
            textarea.className = 'desc-textarea';
            textarea.placeholder = 'Type your answer here...';
            textarea.rows = 6;
            textarea.value = currentAnswer;

            textarea.addEventListener('input', (e) => {
                sessionData.answers[currentQuestionIndex] = e.target.value;
                autoSaveSession(); // Auto-save on answer change
                updateNavigationButtons(); // Update navigation when answer changes
                updateHintVisibility(currentQuestionIndex);
            });

            optionsContainer.appendChild(textarea);
        }
    }

    function renderGuidelines(question) {
        const guidelinesElement = document.getElementById('guidelines');
        const guidelinesTextElement = document.getElementById('guidelines-text');

        if (guidelinesElement && guidelinesTextElement && question.guidelines) {
            guidelinesTextElement.textContent = question.guidelines;
            guidelinesElement.style.display = 'flex';
        } else if (guidelinesElement) {
            guidelinesElement.style.display = 'none';
        }
    }

    function selectOption(option) {
        // Remove previous selection
        const optionItems = document.querySelectorAll('.option-item');
        for (const item of optionItems) {
            item.classList.remove('selected');
        }

        // Add new selection
        const selectedItem = document.querySelector(`.option-item:nth-child(${['a', 'b', 'c', 'd'].indexOf(option) + 1})`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        sessionData.answers[currentQuestionIndex] = option;
        autoSaveSession(); // Auto-save on answer change
        renderNavigation();
        updateNavigationButtons(); // Update navigation when option is selected
        updateHintVisibility(currentQuestionIndex);
    }

    function renderNavigation() {
        if (!testData?.questions) return;

        const navGrid = document.getElementById('nav-grid');
        if (!navGrid) return;

        navGrid.innerHTML = '';

        for (const [index, question] of testData.questions.entries()) {
            const navBtn = document.createElement('button');
            navBtn.className = 'nav-btn';
            navBtn.textContent = index + 1;
            // Mark current and answered state for visual feedback; always allow jumping
            if (index === currentQuestionIndex) {
                navBtn.classList.add('current');
            }

            // Check if question is answered (for visual feedback)
            const answer = sessionData.answers[index];
            let isAnswered = false;

            if (question.type === 'mcq') {
                isAnswered = answer !== undefined && answer !== '';
            } else if (question.type === 'desc') {
                isAnswered = answer !== undefined && answer !== null && answer.trim() !== '';
            }

            if (isAnswered && index <= currentQuestionIndex) {
                navBtn.classList.add('answered');
            }
            // Title / tooltip
            navBtn.title = `Go to Question ${index + 1}`;

            // Always allow jumping to any question (forward or backward)
            navBtn.addEventListener('click', () => goToQuestion(index));
            navGrid.appendChild(navBtn);
        }

        // Update navigation buttons
        updateNavigationButtons();
    }

    function updateNavigationButtons() {
        const nextBtn = document.getElementById('next-btn');
        const submitBtn = document.getElementById('submit-btn');
        const prevBtn = document.getElementById('prev-btn');

        if (!testData?.questions) return;

        const currentQuestion = testData.questions[currentQuestionIndex];
        const currentAnswer = sessionData.answers[currentQuestionIndex];
        const isCurrentAnswered = currentQuestion && (
            (currentQuestion.type === 'mcq' && currentAnswer !== undefined && currentAnswer !== '') ||
            (currentQuestion.type === 'desc' && currentAnswer !== undefined && currentAnswer !== null && currentAnswer.trim() !== '')
        );

        // Show next button if not the last question (available even if unanswered)
        if (nextBtn) {
            if (currentQuestionIndex < testData.questions.length - 1) {
                nextBtn.style.display = 'flex';
                nextBtn.disabled = false;
            } else {
                nextBtn.style.display = 'none';
            }
        }

        // Determine whether current question is attempted
        const shouldShowOnAttempt = isCurrentAnswered;

        // Show prev button if not on first question; keep hidden on first question
        if (prevBtn) {
            if (currentQuestionIndex > 0) {
                prevBtn.style.display = 'flex';
                prevBtn.disabled = false;
            } else {
                prevBtn.style.display = 'none';
            }
        }

        // Keep submit button visible; actual submission will check attempt state
        if (submitBtn) {
            submitBtn.style.display = 'flex';
            // Visual hint when not attempted
            if (!shouldShowOnAttempt) {
                submitBtn.title = 'Attempt the current question to enable submission';
                submitBtn.style.opacity = '0.75';
            } else {
                submitBtn.title = '';
                submitBtn.style.opacity = '';
            }
        }
    }

    function goToQuestion(index) {
        // Allow jumping to any valid question index (forward or backward)
        if (!testData?.questions) return;
        if (index < 0 || index >= testData.questions.length) return;

        currentQuestionIndex = index;
        sessionData.currentIndex = index;
        renderQuestion();
        renderNavigation();
        updateProgress();
        saveSessionData();
    }

    function updateProgress() {
        if (!testData) return;

        // Calculate progress based on answered questions
        const answeredCount = Object.values(sessionData.answers).filter(answer =>
            answer !== undefined && answer !== null && answer !== ''
        ).length;

        const progress = (answeredCount / testData.questions.length) * 100;
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');

        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }

        if (progressText) {
            // Show both completion and score progress
            const evaluation = evaluateTest();
            const scorePercentage = evaluation.totalPossibleScore > 0 ?
                Math.round((evaluation.score / evaluation.totalPossibleScore) * 100) : 0;
            progressText.textContent = `${Math.round(progress)}% (${scorePercentage}% score)`;
        }

        // Update question count to show current position
        const questionCountElement = document.getElementById('question-count');
        if (questionCountElement && testData.questions) {
            questionCountElement.textContent = `Question ${currentQuestionIndex + 1} of ${testData.questions.length}`;
        }
    }

    function hideLoading() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Navigation
    document.getElementById('next-btn')?.addEventListener('click', function() {
        if (currentQuestionIndex < testData.questions.length - 1) {
            goToQuestion(currentQuestionIndex + 1);
        }
    });

    document.getElementById('prev-btn')?.addEventListener('click', function() {
        if (currentQuestionIndex > 0) {
            goToQuestion(currentQuestionIndex - 1);
        }
    });

    document.getElementById('submit-btn')?.addEventListener('click', function() {
        // Prevent submission of the current question if it hasn't been attempted
        const isAttempted = isQuestionAttempted(currentQuestionIndex);
        if (!isAttempted) {
            alert('Please attempt the current question before submitting it.');
            return;
        }

        if (confirm('Are you sure you want to submit the test? This action cannot be undone.')) {
            sessionData.completed = true;
            saveSessionData();
            showCompletionModal();
        }
    });

    function closeReportModal() {
        document.getElementById('report-modal').style.display = 'none';
    }

    function showCompletionModal() {
        const modal = document.getElementById('completion-modal');
        if (!modal) return;

        // Calculate completion statistics
        const evaluation = evaluateTest();
        const answeredCount = Object.values(sessionData.answers).filter(answer =>
            answer !== undefined && answer !== null && answer !== ''
        ).length;

        // Update modal content
        const totalQuestionsElement = document.getElementById('total-questions');
        const answeredQuestionsElement = document.getElementById('answered-questions');
        const completionPercentageElement = document.getElementById('completion-percentage');
        const scoreBreakdownElement = document.getElementById('score-breakdown');
        const scoreBreakdownTextElement = document.getElementById('score-breakdown-text');

        if (totalQuestionsElement) {
            totalQuestionsElement.textContent = testData.questions.length;
        }

        if (answeredQuestionsElement) {
            answeredQuestionsElement.textContent = answeredCount;
        }

        if (completionPercentageElement) {
            const scorePercentage = evaluation.totalPossibleScore > 0 ?
                Math.round((evaluation.score / evaluation.totalPossibleScore) * 100) : 0;
            completionPercentageElement.textContent = `${scorePercentage}%`;
        }

        // Show score breakdown if there are descriptive questions or detailed scoring needed
        if (scoreBreakdownElement && scoreBreakdownTextElement) {
            let breakdownText = `MCQ: ${evaluation.correct}/${evaluation.total} correct`;
            if (evaluation.descriptiveCount > 0) {
                const descriptiveScore = sessionData.descriptiveScores ?
                    Object.values(sessionData.descriptiveScores).reduce((sum, score) => sum + (score || 0), 0) : 0;
                breakdownText += `<br>Descriptive: ${descriptiveScore}/${evaluation.descriptiveCount} graded`;
            }
            scoreBreakdownTextElement.innerHTML = breakdownText;

            // Show breakdown if there are descriptive questions or if MCQ score is not 100%
            const showBreakdown = evaluation.descriptiveCount > 0 ||
                (evaluation.total > 0 && evaluation.correct !== evaluation.total);
            scoreBreakdownElement.style.display = showBreakdown ? 'block' : 'none';
        }

        modal.style.display = 'flex';
    }

    function showDetailedReport() {
        const modal = document.getElementById('report-modal');
        const content = document.getElementById('report-content');

        if (!modal || !content) return;

        // Calculate evaluation
        const evaluation = evaluateTest();

        // Generate report HTML
        let reportHtml = `
            <div class="report-section">
                <h3><i class="fas fa-chart-pie"></i> Test Summary</h3>
                <div class="report-summary">
                    <div class="summary-card">
                        <span class="value">${evaluation.total}</span>
                        <span class="label">Total Questions</span>
                    </div>
                    <div class="summary-card">
                        <span class="value">${evaluation.correct}</span>
                        <span class="label">Correct Answers</span>
                    </div>
                    <div class="summary-card">
                        <span class="value">${evaluation.score}</span>
                        <span class="label">Total Score</span>
                    </div>
                    <div class="summary-card">
                        <span class="value">${Math.round((evaluation.score / evaluation.totalPossibleScore) * 100)}%</span>
                        <span class="label">Overall Score</span>
                    </div>
                </div>
            </div>

            <div class="report-section">
                <h3><i class="fas fa-list-check"></i> Question by Question Review</h3>
                <div class="question-review">
        `;

        // Add each question review
        testData.questions.forEach((question, index) => {
            const userAnswer = sessionData.answers[index];
            const isMCQ = question.type === 'mcq';
            const isCorrect = isMCQ ? (userAnswer && question.correct && userAnswer.toLowerCase() === question.correct.toLowerCase()) : false;
            const hasDescriptiveScore = sessionData.descriptiveScores && sessionData.descriptiveScores[index] !== undefined;

            let statusClass = 'pending';
            let statusText = 'Not Attempted';

            if (isMCQ) {
                if (userAnswer) {
                    statusClass = isCorrect ? 'correct' : 'incorrect';
                    statusText = isCorrect ? 'Correct' : 'Incorrect';
                }
            } else {
                if (hasDescriptiveScore) {
                    statusClass = 'correct'; // Assuming graded descriptive questions are marked as correct for display
                    statusText = `Graded (${sessionData.descriptiveScores[index]} points)`;
                } else if (userAnswer && userAnswer.trim()) {
                    statusClass = 'pending';
                    statusText = 'Submitted - Pending Grading';
                }
            }

            reportHtml += `
                <div class="question-item">
                    <div class="question-header">
                        <span class="question-number">Question ${index + 1}</span>
                        <span class="question-status ${statusClass}">
                            <i class="fas fa-${statusClass === 'correct' ? 'check-circle' : statusClass === 'incorrect' ? 'times-circle' : 'clock'}"></i>
                            ${statusText}
                        </span>
                    </div>
                    <div class="question-content">
                        <div class="question-text">${question.text || question.question || ''}</div>
            `;

            if (userAnswer) {
                reportHtml += `
                    <div class="user-answer">
                        <div class="answer-label">Your Answer:</div>
                        <div class="answer-text">${isMCQ ? `${userAnswer.toUpperCase()}. ${question[userAnswer] || 'Invalid option'}` : userAnswer}</div>
                    </div>
                `;
            }

            if (isMCQ && question.correct) {
                reportHtml += `
                    <div class="correct-answer">
                        <div class="answer-label">Correct Answer:</div>
                        <div class="answer-text">${question.correct.toUpperCase()}. ${question[question.correct] || ''}</div>
                    </div>
                `;
            }

            if (hasDescriptiveScore) {
                reportHtml += `
                    <div class="score-display">
                        <i class="fas fa-star"></i>
                        Score: ${sessionData.descriptiveScores[index]}/${question.type === 'desc' ? 1 : 1}
                    </div>
                `;
            }

            reportHtml += `
                    </div>
                </div>
            `;
        });

        reportHtml += `
                </div>
            </div>
        `;

        content.innerHTML = reportHtml;
        modal.style.display = 'flex';
    }

    // Completion modal handlers
    document.getElementById('reattempt-btn')?.addEventListener('click', function() {
        if (confirm('Are you sure you want to reattempt this test? All your previous progress and answers will be lost.')) {
            // Reset session data
            sessionData = {
                answers: {},
                currentIndex: 0,
                answered: 0,
                total: testData.questions.length,
                completed: false
            };
            currentQuestionIndex = 0;

            // Save reset session
            saveSessionData();

            // Hide modal and restart test
            document.getElementById('completion-modal').style.display = 'none';

            // Reset UI and start fresh
            renderQuestion();
            renderNavigation();
            updateProgress();
        }
    });

    document.getElementById('view-report-btn')?.addEventListener('click', function() {
        document.getElementById('completion-modal').style.display = 'none';
        showDetailedReport();
    });

    document.getElementById('back-to-dashboard-btn')?.addEventListener('click', function() {
        globalThis.location.href = 'studentdashboard.html';
    });

    // Report modal handlers
    document.getElementById('close-report-btn')?.addEventListener('click', function() {
        closeReportModal();
    });

    document.getElementById('close-report-modal-btn')?.addEventListener('click', function() {
        closeReportModal();
    });

    document.getElementById('report-back-to-dashboard-btn')?.addEventListener('click', function() {
        globalThis.location.href = 'studentdashboard.html';
    });

    function showResumeModal() {
        const modal = document.getElementById('resume-modal');
        if (modal) {
            const answeredCount = Object.keys(sessionData.answers || {}).length;
            const totalQuestions = testData.questions.length;
            const progressPercent = Math.round((answeredCount / totalQuestions) * 100);

            // Update modal content with progress info
            const modalContent = modal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.innerHTML = `
                    <h2><i class="fas fa-play-circle"></i> Resume Test</h2>
                    <div class="resume-info">
                        <p>You have an unfinished test with progress saved.</p>
                        <div class="progress-summary">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                            <span class="progress-text">${answeredCount}/${totalQuestions} questions answered (${progressPercent}%)</span>
                        </div>
                        <p>Would you like to resume where you left off or start over?</p>
                    </div>
                    <div class="modal-actions">
                        <button id="resume-btn" class="btn-primary">Resume Test</button>
                        <button id="restart-btn" class="btn-secondary">Start Over</button>
                    </div>
                `;
            }

            modal.style.display = 'flex';

            // Re-attach event listeners
            document.getElementById('resume-btn')?.addEventListener('click', function() {
                modal.style.display = 'none';
                renderQuestion();
                renderNavigation();
                updateProgress();
            });

            document.getElementById('restart-btn')?.addEventListener('click', function() {
                if (confirm('Are you sure you want to start over? All your progress will be lost.')) {
                    sessionData = { answers: {}, currentIndex: 0 };
                    currentQuestionIndex = 0;
                    modal.style.display = 'none';
                    renderQuestion();
                    renderNavigation();
                    updateProgress();
                    saveSessionData();
                }
            });
        }
    }
});
