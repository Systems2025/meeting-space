document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURATION ---
    const ZAPIER_CHECK_AVAILABILITY_WEBHOOK_URL = 'https://hook.eu2.make.com/g4ps2ybsu0561400xn9gzgj79k1vuwdg'; // <-- REPLACE
    const ZAPIER_SUBMIT_BOOKING_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/20644786/27k2lwr/';     // <-- REPLACE

    // DOM Elements
    const calendarDaysGrid = document.getElementById('calendarDays');
    const currentMonthYearDisplay = document.getElementById('currentMonthYear');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const timeSlotsContainer = document.getElementById('timeSlotsContainer');
    const durationSelect = document.getElementById('duration');
    const spaceSelectInput = document.getElementById('spaceSelectInput');

    const summarySpaceElem = document.getElementById('summarySpace');
    const summaryDateElem = document.getElementById('summaryDate');
    const summaryTimeElem = document.getElementById('summaryTime');
    const summaryDurationElem = document.getElementById('summaryDuration');
    const summaryTotalDurationElem = document.getElementById('summaryTotalDuration');

    const spaceBookingForm = document.getElementById('spaceBookingForm');
    const bookedByInput = document.getElementById('bookedBy');
    const purposeTextarea = document.getElementById('purpose');
    const sendConfirmationCheckbox = document.getElementById('sendConfirmation');
    const messageDiv = document.getElementById('message');

    const checkAvailabilityBtn = document.getElementById('checkAvailabilityBtn');
    const availabilityStatusBox = document.getElementById('availabilityStatus');
    const scheduleBtn = document.querySelector('.schedule-btn');

    const hiddenStartTimeInput = document.getElementById('hiddenStartTime');
    const hiddenEndTimeInput = document.getElementById('hiddenEndTime');
    const hiddenTotalDurationHoursInput = document.getElementById('hiddenTotalDurationHours');

    // State
    let currentDisplayedDate = new Date();
    let selectedSpace = spaceSelectInput.value;
    let selectedDate = null;
    let selectedTimeSlots = new Set();
    let durationPerSlotHours = parseFloat(durationSelect.value);

    const availableBaseTimes = [ // Example: 30 min interval base times
        "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
        "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
        "16:00", "16:30", "17:00", "17:30", "18:00"
    ];

    // --- EVENT LISTENERS ---
    spaceSelectInput.addEventListener('change', (e) => {
        selectedSpace = e.target.value;
        selectedTimeSlots.clear();
        renderTimeSlots();
        updateSummary();
        resetAvailabilityStatus();
    });

    durationSelect.addEventListener('change', (e) => {
        durationPerSlotHours = parseFloat(e.target.value);
        selectedTimeSlots.clear();
        renderTimeSlots();
        updateSummary();
        resetAvailabilityStatus();
    });

    prevMonthBtn.addEventListener('click', () => {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() - 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentDisplayedDate.setMonth(currentDisplayedDate.getMonth() + 1);
        renderCalendar();
    });

    checkAvailabilityBtn.addEventListener('click', async function() {
        if (!selectedSpace || !selectedDate) {
            availabilityStatusBox.textContent = 'Please select a space and a date first.';
            availabilityStatusBox.className = 'availability-status-box error';
            return;
        }

        availabilityStatusBox.textContent = 'Checking availability...';
        availabilityStatusBox.className = 'availability-status-box loading';
        checkAvailabilityBtn.disabled = true;
        scheduleBtn.disabled = true;

        const checkData = {
            space: selectedSpace,
            date: selectedDate.toISOString().split('T')[0], // YYYY-MM-DD
        };

        try {
            const response = await fetch(ZAPIER_CHECK_AVAILABILITY_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', }, // Zapier webhooks typically don't need specific auth headers
                body: JSON.stringify(checkData),
            });

            if (!response.ok) {
                let errorMsg = `Error checking availability (HTTP ${response.status}).`;
                try { 
                    const errorData = await response.json(); 
                    if (errorData && (errorData.message || errorData.error)) { 
                        errorMsg += ` ${errorData.message || errorData.error}`; 
                    }
                } catch (e) { /* Ignore if response is not JSON */ }
                throw new Error(errorMsg);
            }

            const result = await response.json();
            availabilityStatusBox.className = 'availability-status-box'; // Reset class
            if (result.status === 'available') {
                availabilityStatusBox.textContent = result.message || 'Space is available.';
                availabilityStatusBox.classList.add('available');
                scheduleBtn.disabled = false;
            } else if (result.status === 'partially_booked') {
                let message = result.message || 'Some slots are taken.';
                if (result.booked_slots && result.booked_slots.length > 0) {
                    message += ' Booked: <ul>';
                    result.booked_slots.forEach(slot => { message += `<li>${slot}</li>`; });
                    message += '</ul>';
                }
                availabilityStatusBox.innerHTML = message; // Use innerHTML for list
                availabilityStatusBox.classList.add('partially-booked'); // Or 'not-available' if you prefer stricter styling
                scheduleBtn.disabled = false;
            } else if (result.status === 'fully_booked') {
                availabilityStatusBox.textContent = result.message || 'Space is fully booked for this day.';
                availabilityStatusBox.classList.add('not-available');
                // scheduleBtn remains disabled or is explicitly disabled
            } else { // Unknown status or error from Zapier's logic
                availabilityStatusBox.textContent = result.message || 'Could not determine availability. Please try again.';
                availabilityStatusBox.classList.add('error');
            }

        } catch (error) {
            console.error('Error calling Zapier check availability webhook:', error);
            availabilityStatusBox.textContent = `Error: ${error.message || 'Availability check failed.'}`;
            availabilityStatusBox.className = 'availability-status-box error';
        } finally {
            checkAvailabilityBtn.disabled = false;
            // Decide if scheduleBtn should be re-enabled here or based on status
            if (availabilityStatusBox.classList.contains('error') || availabilityStatusBox.classList.contains('not-available')) {
                 scheduleBtn.disabled = true;
            }
        }
    });

    // --- CALENDAR LOGIC ---
    function renderCalendar() {
        calendarDaysGrid.innerHTML = '';
        const year = currentDisplayedDate.getFullYear();
        const month = currentDisplayedDate.getMonth();
        currentMonthYearDisplay.textContent = `${currentDisplayedDate.toLocaleString('default', { month: 'long' })} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startingDayOfWeek = firstDayOfMonth.getDay();
        const today = new Date(); today.setHours(0, 0, 0, 0);

        for (let i = 0; i < startingDayOfWeek; i++) {
            calendarDaysGrid.appendChild(Object.assign(document.createElement('div'), { classList: 'calendar-day empty' }));
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = Object.assign(document.createElement('div'), { classList: 'calendar-day', textContent: day });
            const currentDateLoop = new Date(year, month, day);
            if (currentDateLoop < today) {
                dayCell.classList.add('past-day');
            } else {
                dayCell.addEventListener('click', () => {
                    if (dayCell.classList.contains('past-day') || !selectedSpace) {
                        if(!selectedSpace) alert("Please select a space first.");
                        return;
                    }
                    const prevSelected = calendarDaysGrid.querySelector('.selected-day');
                    if (prevSelected) prevSelected.classList.remove('selected-day');
                    selectedDate = currentDateLoop;
                    dayCell.classList.add('selected-day');
                    selectedTimeSlots.clear();
                    renderTimeSlots();
                    updateSummary();
                    resetAvailabilityStatus();
                });
            }
            if (selectedDate && selectedDate.getTime() === currentDateLoop.getTime()) dayCell.classList.add('selected-day');
            calendarDaysGrid.appendChild(dayCell);
        }
    }

    // --- TIME SLOT LOGIC ---
    function formatTime(dateObj) {
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    function getTimeSlotEnd(startTimeStr, durationHours) {
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        const startDate = new Date(2000, 0, 1, hours, minutes);
        const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);
        return `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
    }
    function renderTimeSlots() {
        timeSlotsContainer.innerHTML = '';
        if (!selectedSpace || !selectedDate) {
            const placeholder = document.createElement('p');
            placeholder.textContent = !selectedSpace ? "Select a space first." : "Select a date to see available times.";
            placeholder.style.textAlign = "center"; placeholder.style.color = "#777";
            timeSlotsContainer.appendChild(placeholder);
            return;
        }
        availableBaseTimes.forEach((baseStartTime, index) => {
            const slotItem = document.createElement('div'); slotItem.classList.add('time-slot-item');
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'timeSlot'; checkbox.id = `timeSlot-${index}`; checkbox.value = baseStartTime;
            const label = document.createElement('label'); label.htmlFor = `timeSlot-${index}`;
            const slotEndTimeStr = getTimeSlotEnd(baseStartTime, durationPerSlotHours);
            const dummyStartDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), ...baseStartTime.split(':').map(Number));
            const dummyEndDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), ...slotEndTimeStr.split(':').map(Number));
            label.textContent = `${formatTime(dummyStartDate)} - ${formatTime(dummyEndDate)}`;
            slotItem.append(checkbox, label);
            const now = new Date(); const [slotH, slotM] = baseStartTime.split(':').map(Number);
            const slotDateTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), slotH, slotM);
            if (selectedDate.toDateString() === now.toDateString() && slotDateTime < now) {
                slotItem.classList.add('disabled'); checkbox.disabled = true;
            } else {
                if (selectedTimeSlots.has(baseStartTime)) { checkbox.checked = true; slotItem.classList.add('selected-time'); }
                slotItem.addEventListener('click', (e) => {
                    if (slotItem.classList.contains('disabled')) return;
                    if (e.target !== checkbox) checkbox.checked = !checkbox.checked;
                    if (checkbox.checked) { selectedTimeSlots.add(baseStartTime); slotItem.classList.add('selected-time'); }
                    else { selectedTimeSlots.delete(baseStartTime); slotItem.classList.remove('selected-time'); }
                    updateSummary();
                });
            }
            timeSlotsContainer.appendChild(slotItem);
        });
    }

    // --- UPDATE SUMMARY & HIDDEN FIELDS ---
    function updateSummary() {
        summarySpaceElem.textContent = selectedSpace ? spaceSelectInput.options[spaceSelectInput.selectedIndex].text.split(' (')[0] : "Select a space";
        summaryDateElem.textContent = selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : "Select a date";
        const durationPerSlotText = durationSelect.options[durationSelect.selectedIndex].text;
        summaryDurationElem.textContent = durationPerSlotText;

        if (selectedTimeSlots.size > 0 && selectedDate) {
            const sortedSlots = Array.from(selectedTimeSlots).sort();
            const firstSlotStartStr = sortedSlots[0];
            const lastSlotStartStr = sortedSlots[sortedSlots.length - 1];
            const overallStartTimeObj = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), ...firstSlotStartStr.split(':').map(Number));
            const lastSlotEndTimeStr = getTimeSlotEnd(lastSlotStartStr, durationPerSlotHours);
            const overallEndTimeObj = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), ...lastSlotEndTimeStr.split(':').map(Number));
            summaryTimeElem.textContent = `${formatTime(overallStartTimeObj)} - ${formatTime(overallEndTimeObj)} (Overall)`;
            const toLocalISOString = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            hiddenStartTimeInput.value = toLocalISOString(overallStartTimeObj);
            hiddenEndTimeInput.value = toLocalISOString(overallEndTimeObj);
            const totalDuration = selectedTimeSlots.size * durationPerSlotHours;
            summaryTotalDurationElem.textContent = `${totalDuration} hour${totalDuration !== 1 ? 's' : ''}`;
            hiddenTotalDurationHoursInput.value = totalDuration;
        } else {
            summaryTimeElem.textContent = "Select time(s)";
            summaryTotalDurationElem.textContent = "0 hours";
            hiddenStartTimeInput.value = ""; hiddenEndTimeInput.value = ""; hiddenTotalDurationHoursInput.value = "";
        }
    }
    
    function resetAvailabilityStatus() {
        availabilityStatusBox.textContent = 'Please select a space and date, then check availability.';
        availabilityStatusBox.className = 'availability-status-box';
        scheduleBtn.disabled = true;
    }

    // --- FORM SUBMISSION (Uses ZAPIER_SUBMIT_BOOKING_WEBHOOK_URL) ---
    spaceBookingForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        messageDiv.textContent = 'Submitting booking...';
        messageDiv.className = 'form-message loading';
        scheduleBtn.disabled = true;

        if (!selectedSpace) { messageDiv.textContent = 'Please select a space.'; messageDiv.classList.remove('loading'); messageDiv.classList.add('error'); scheduleBtn.disabled = false; return; }
        if (!selectedDate || selectedTimeSlots.size === 0) { messageDiv.textContent = 'Please select a date and at least one time slot.'; messageDiv.classList.remove('loading'); messageDiv.classList.add('error'); scheduleBtn.disabled = false; return; }
        if (!bookedByInput.value) { messageDiv.textContent = 'Please enter who is booking the space.'; messageDiv.classList.remove('loading'); messageDiv.classList.add('error'); scheduleBtn.disabled = false; return; }

        if (!availabilityStatusBox.classList.contains('available') && !availabilityStatusBox.classList.contains('partially-booked')) {
            if (!confirm("Availability status is not marked as 'Available' or 'Partially Booked'. This might result in a double booking. Do you still want to proceed?")) {
                messageDiv.textContent = 'Booking cancelled by user.'; messageDiv.classList.remove('loading');
                // Re-enable schedule button based on current availability status logic
                if (availabilityStatusBox.classList.contains('available') || availabilityStatusBox.classList.contains('partially-booked')) {
                    scheduleBtn.disabled = false;
                } else {
                    scheduleBtn.disabled = true;
                }
                return;
            }
        }

        const bookingPayload = {
            'Space': selectedSpace,
            'Booked By': bookedByInput.value,
            'Purpose/Notes': purposeTextarea.value,
            'Start Time': hiddenStartTimeInput.value,
            'End Time': hiddenEndTimeInput.value,
            'DurationPerSlotHours': durationPerSlotHours,
            'TotalDurationHours': parseFloat(hiddenTotalDurationHoursInput.value),
            'BookedSlots': Array.from(selectedTimeSlots).sort().join(', '),
            'SendConfirmation': sendConfirmationCheckbox.checked,
            'SelectedDate': selectedDate.toISOString().split('T')[0] 
        };
        
        try {
            const response = await fetch(ZAPIER_SUBMIT_BOOKING_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingPayload)
            });

            messageDiv.className = 'form-message'; // Reset from loading

            if (response.ok) {
                const result = await response.json();
                if (result.status === 'success') {
                    messageDiv.textContent = result.message || 'Space booked successfully!';
                    if (result.recordId) { messageDiv.textContent += ` Record ID: ${result.recordId}`; }
                    messageDiv.classList.add('success');
                    resetFormAndSelections();
                } else {
                    messageDiv.textContent = result.message || 'Booking failed. Please try again.';
                    messageDiv.classList.add('error');
                }
            } else {
                let errorMsg = `Booking submission failed (HTTP ${response.status}).`;
                try { const errorData = await response.json(); if (errorData && (errorData.message || errorData.error)) { errorMsg += ` ${errorData.message || errorData.error}`; }} catch (e) {}
                messageDiv.textContent = errorMsg;
                messageDiv.classList.add('error');
            }
        } catch (error) {
            console.error('Network or other error during booking submission:', error);
            messageDiv.textContent = 'Network error during booking. ' + error.message;
            messageDiv.className = 'form-message error';
        } finally {
            // Re-enable button based on availability (or always if preferred UX)
            if(availabilityStatusBox.classList.contains('available') || availabilityStatusBox.classList.contains('partially-booked')){
                scheduleBtn.disabled = false;
            } else {
                scheduleBtn.disabled = true; // Keep it disabled if check showed not available
            }
             // If an error occurred during submission itself, user might want to retry
            if (messageDiv.classList.contains('error') && !(availabilityStatusBox.classList.contains('available') || availabilityStatusBox.classList.contains('partially-booked'))) {
                // Keep disabled
            } else if(messageDiv.classList.contains('error')) {
                scheduleBtn.disabled = false; // Allow retry if it was network etc. and availability was good
            }

        }
    });

    function resetFormAndSelections() {
        spaceBookingForm.reset();
        sendConfirmationCheckbox.checked = true;
        spaceSelectInput.value = ""; selectedSpace = "";
        selectedDate = null;
        selectedTimeSlots.clear();
        durationPerSlotHours = parseFloat(durationSelect.options[0].value);
        durationSelect.value = durationPerSlotHours;
        const prevSelectedDay = calendarDaysGrid.querySelector('.selected-day');
        if (prevSelectedDay) prevSelectedDay.classList.remove('selected-day');
        document.querySelectorAll('.time-slot-item.selected-time').forEach(el => el.classList.remove('selected-time'));
        document.querySelectorAll('.time-slot-item input[type="checkbox"]').forEach(cb => cb.checked = false);
        renderTimeSlots();
        updateSummary();
        resetAvailabilityStatus();
    }

    // --- INITIAL RENDER ---
    renderCalendar();
    renderTimeSlots();
    updateSummary();
    resetAvailabilityStatus();
    scheduleBtn.disabled = true;
});
