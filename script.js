document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURATION ---
    // WARNING: EXPOSING THESE URLS CLIENT-SIDE IS A SECURITY RISK FOR PRODUCTION.
    // USE A SERVERLESS FUNCTION PROXY IN A REAL APPLICATION.
    const ZAPIER_CHECK_AVAILABILITY_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/YOUR_USER_ID/YOUR_AVAILABILITY_HOOK_ID/'; // <-- REPLACE WITH YOUR ACTUAL ZAPIER URL
    const ZAPIER_SUBMIT_BOOKING_WEBHOOK_URL = 'https://hooks.zapier.com/hooks/catch/YOUR_USER_ID/YOUR_SUBMIT_HOOK_ID/';     // <-- REPLACE WITH YOUR ACTUAL ZAPIER URL

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
        console.log('Space selected:', selectedSpace);
        selectedTimeSlots.clear();
        renderTimeSlots();
        updateSummary();
        resetAvailabilityStatus();
    });

    durationSelect.addEventListener('change', (e) => {
        durationPerSlotHours = parseFloat(e.target.value);
        console.log('Duration selected (hours):', durationPerSlotHours);
        if (isNaN(durationPerSlotHours)) {
            console.error("Selected duration is NaN. Check option values in HTML.");
            durationPerSlotHours = 0.5; // Fallback to a default
        }
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
            // Optionally send durationPerSlotHours if your Zapier logic needs it to calculate display slots
            durationPerSlotHours: durationPerSlotHours
        };
        console.log("Checking availability with data:", checkData);

        try {
            const response = await fetch(ZAPIER_CHECK_AVAILABILITY_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(checkData),
            });

            if (!response.ok) {
                let errorMsg = `Error checking availability (HTTP ${response.status}).`;
                try {
                    const errorData = await response.json();
                    if (errorData && (errorData.message || errorData.error)) {
                        errorMsg += ` ${errorData.message || errorData.error}`;
                    }
                } catch (e) { console.warn("Could not parse JSON error response from availability check:", e); }
                throw new Error(errorMsg);
            }

            const result = await response.json();
            console.log("Availability check result from Zapier:", result);
            availabilityStatusBox.className = 'availability-status-box'; // Reset class

            // Clear previously marked externally booked slots if any
            document.querySelectorAll('.time-slot-item.externally-booked').forEach(el => {
                el.classList.remove('externally-booked');
                const cb = el.querySelector('input[type="checkbox"]');
                if (cb && !cb.parentElement.classList.contains('disabled')) { // Don't re-enable past slots
                     cb.disabled = false;
                }
            });


            if (result.status === 'available') {
                availabilityStatusBox.textContent = result.message || 'Space is available.';
                availabilityStatusBox.classList.add('available');
                scheduleBtn.disabled = false;
            } else if (result.status === 'partially_booked') {
                let messageText = result.message || 'Some slots are taken.';
                availabilityStatusBox.textContent = ''; // Clear before adding elements

                const messageP = document.createElement('p');
                messageP.textContent = messageText;
                availabilityStatusBox.appendChild(messageP);


                if (result.booked_slots && Array.isArray(result.booked_slots) && result.booked_slots.length > 0) {
                    const p = document.createElement('p');
                    p.textContent = 'Booked Times:';
                    p.style.marginTop = '5px'; p.style.fontWeight = 'bold';
                    const ul = document.createElement('ul');
                    ul.style.listStylePosition = 'inside'; ul.style.paddingLeft = '0';
                    result.booked_slots.forEach(slot => {
                        const li = document.createElement('li');
                        li.textContent = slot; // Assuming 'slot' is a string like "HH:MM - HH:MM"
                        ul.appendChild(li);
                    });
                    availabilityStatusBox.appendChild(p);
                    availabilityStatusBox.appendChild(ul);
                    // Assuming 'booked_slots' are like "09:00 - 09:30", extract start time
                    const bookedStartTimes = result.booked_slots.map(s => {
                        if (typeof s === 'string') return s.split(' - ')[0];
                        return null; // Or handle error
                    }).filter(Boolean); // Remove nulls
                    console.log("Marking as booked based on start times:", bookedStartTimes);
                    markSlotsAsBooked(bookedStartTimes);
                } else {
                    console.warn("Partially booked status but no booked_slots array or it's empty:", result.booked_slots);
                }
                availabilityStatusBox.classList.add('partially-booked');
                scheduleBtn.disabled = false;
            } else if (result.status === 'fully_booked') {
                availabilityStatusBox.textContent = result.message || 'Space is fully booked for this day.';
                availabilityStatusBox.classList.add('not-available');
            } else {
                availabilityStatusBox.textContent = result.message || 'Could not determine availability. Please try again.';
                availabilityStatusBox.classList.add('error');
            }

        } catch (error) {
            console.error('Error calling Zapier check availability webhook:', error);
            availabilityStatusBox.textContent = `Error: ${error.message || 'Availability check failed.'}`;
            availabilityStatusBox.className = 'availability-status-box error';
        } finally {
            checkAvailabilityBtn.disabled = false;
            if (availabilityStatusBox.classList.contains('error') || availabilityStatusBox.classList.contains('not-available')) {
                 scheduleBtn.disabled = true;
            }
        }
    });

    function markSlotsAsBooked(bookedStartTimesArray) {
        if (!Array.isArray(bookedStartTimesArray)) {
            console.error("markSlotsAsBooked expected an array, got:", bookedStartTimesArray);
            return;
        }
        const allSlotCheckboxes = timeSlotsContainer.querySelectorAll('input[type="checkbox"]');
        allSlotCheckboxes.forEach(checkbox => {
            if (bookedStartTimesArray.includes(checkbox.value)) {
                console.log(`Marking slot ${checkbox.value} as externally booked.`);
                checkbox.disabled = true;
                checkbox.checked = false; // Uncheck if it was selected by user
                selectedTimeSlots.delete(checkbox.value); // Remove from user selection
                checkbox.parentElement.classList.add('externally-booked');
                checkbox.parentElement.classList.remove('selected-time');
            }
        });
        updateSummary(); // Reflect changes if user-selected slots were deselected
    }


    // --- CALENDAR LOGIC ---
    function renderCalendar() {
        calendarDaysGrid.innerHTML = '';
        const year = currentDisplayedDate.getFullYear();
        const month = currentDisplayedDate.getMonth();
        currentMonthYearDisplay.textContent = `${currentDisplayedDate.toLocaleString('default', { month: 'long' })} ${year}`;
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday, etc.
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
                    if (dayCell.classList.contains('past-day')) return;
                    if (!selectedSpace) {
                        messageDiv.textContent = "Please select a space first.";
                        messageDiv.className = 'form-message notice';
                        return;
                    }
                    const prevSelected = calendarDaysGrid.querySelector('.selected-day');
                    if (prevSelected) prevSelected.classList.remove('selected-day');
                    selectedDate = new Date(currentDateLoop); // Ensure it's a new Date object
                    console.log('Date selected in calendar:', selectedDate);
                    dayCell.classList.add('selected-day');
                    selectedTimeSlots.clear();
                    renderTimeSlots(); // This should now have a valid selectedDate
                    updateSummary();
                    resetAvailabilityStatus();
                });
            }
            if (selectedDate && selectedDate.getTime() === currentDateLoop.getTime()) {
                dayCell.classList.add('selected-day');
            }
            calendarDaysGrid.appendChild(dayCell);
        }
    }

    // --- TIME SLOT LOGIC ---
    function formatTime(dateObj) {
        // console.log('Formatting time for:', dateObj, typeof dateObj, dateObj instanceof Date, isNaN(dateObj));
        if (!(dateObj instanceof Date) || isNaN(dateObj)) {
            console.warn("formatTime received an invalid Date object:", dateObj);
            return "Invalid Time";
        }
        return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); // Using 24-hour format for consistency with availableBaseTimes
    }

    function getTimeSlotEnd(startTimeStr, durationHours) {
        if (typeof startTimeStr !== 'string' || !startTimeStr.includes(':')) {
            console.error("Invalid startTimeStr for getTimeSlotEnd:", startTimeStr);
            return "00:00"; // Fallback
        }
        if (isNaN(durationHours) || durationHours <= 0) {
            console.error("Invalid durationHours for getTimeSlotEnd:", durationHours);
            return startTimeStr; // Fallback
        }
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        const startDate = new Date(2000, 0, 1, hours, minutes); // Use a dummy date for time calculations
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
            // console.log("RenderTimeSlots: No space or date selected. SelectedDate:", selectedDate);
            return;
        }
        // console.log("RenderTimeSlots: Rendering for date:", selectedDate, "and duration per slot:", durationPerSlotHours);

        availableBaseTimes.forEach((baseStartTime, index) => {
            const slotItem = document.createElement('div'); slotItem.classList.add('time-slot-item');
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'timeSlot'; checkbox.id = `timeSlot-${index}`; checkbox.value = baseStartTime;
            const label = document.createElement('label'); label.htmlFor = `timeSlot-${index}`;

            const [startH, startM] = baseStartTime.split(':').map(Number);
            const dummyStartDateForDisplay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), startH, startM);
            const slotEndTimeStr = getTimeSlotEnd(baseStartTime, durationPerSlotHours);
            const [endH, endM] = slotEndTimeStr.split(':').map(Number);
            const dummyEndDateForDisplay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), endH, endM);

            // console.log(`Slot ${baseStartTime}: StartObj: ${dummyStartDateForDisplay}, EndObj: ${dummyEndDateForDisplay}`);

            label.textContent = `${formatTime(dummyStartDateForDisplay)} - ${formatTime(dummyEndDateForDisplay)}`;
            slotItem.append(checkbox, label);

            const now = new Date();
            const slotDateTime = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), startH, startM);

            if (selectedDate.toDateString() === now.toDateString() && slotDateTime < now) {
                slotItem.classList.add('disabled'); checkbox.disabled = true;
            } else {
                if (selectedTimeSlots.has(baseStartTime)) { checkbox.checked = true; slotItem.classList.add('selected-time'); }
                slotItem.addEventListener('click', (e) => {
                    if (slotItem.classList.contains('disabled') || slotItem.classList.contains('externally-booked')) return;
                    if (e.target !== checkbox) checkbox.checked = !checkbox.checked;

                    if (checkbox.checked) { selectedTimeSlots.add(baseStartTime); slotItem.classList.add('selected-time'); }
                    else { selectedTimeSlots.delete(baseStartTime); slotItem.classList.remove('selected-time'); }
                    // console.log('Selected time slots updated:', selectedTimeSlots);
                    updateSummary();
                });
            }
            timeSlotsContainer.appendChild(slotItem);
        });
    }

    // --- UPDATE SUMMARY & HIDDEN FIELDS ---
    function updateSummary() {
        summarySpaceElem.textContent = selectedSpace && spaceSelectInput.options[spaceSelectInput.selectedIndex] ? spaceSelectInput.options[spaceSelectInput.selectedIndex].text.split(' (')[0] : "Select a space";
        summaryDateElem.textContent = selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : "Select a date";
        const durationOption = durationSelect.options[durationSelect.selectedIndex];
        summaryDurationElem.textContent = durationOption ? durationOption.text : "Select duration";

        // console.log('updateSummary called. Selected Date:', selectedDate, 'Selected Time Slots:', new Set(selectedTimeSlots), 'Duration per slot:', durationPerSlotHours);


        if (selectedTimeSlots.size > 0 && selectedDate && !isNaN(durationPerSlotHours) && durationPerSlotHours > 0) {
            const sortedSlots = Array.from(selectedTimeSlots).sort();
            const firstSlotStartStr = sortedSlots[0];
            const lastSlotStartStr = sortedSlots[sortedSlots.length - 1];

            // console.log('UpdateSummary - Sorted Slots for Summary:', sortedSlots);
            // console.log('UpdateSummary - First Slot:', firstSlotStartStr, 'Last Slot:', lastSlotStartStr);

            const [firstH, firstM] = firstSlotStartStr.split(':').map(Number);
            const overallStartTimeObj = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), firstH, firstM);

            const lastSlotEndTimeStr = getTimeSlotEnd(lastSlotStartStr, durationPerSlotHours);
            const [lastEndH, lastEndM] = lastSlotEndTimeStr.split(':').map(Number);
            const overallEndTimeObj = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), lastEndH, lastEndM);

            // console.log('UpdateSummary - Overall Start Time Obj:', overallStartTimeObj, 'Is Valid:', !isNaN(overallStartTimeObj));
            // console.log('UpdateSummary - Overall End Time Obj:', overallEndTimeObj, 'Is Valid:', !isNaN(overallEndTimeObj));

            summaryTimeElem.textContent = `${formatTime(overallStartTimeObj)} - ${formatTime(overallEndTimeObj)} (Overall)`;
            hiddenStartTimeInput.value = overallStartTimeObj.toISOString();
            hiddenEndTimeInput.value = overallEndTimeObj.toISOString();

            const totalDuration = selectedTimeSlots.size * durationPerSlotHours;
            summaryTotalDurationElem.textContent = `${totalDuration} hour${totalDuration !== 1 ? 's' : ''}`;
            hiddenTotalDurationHoursInput.value = totalDuration;
        } else {
            // console.log('UpdateSummary: Conditions not met for time calculation. Slots size:', selectedTimeSlots.size, 'Date:', selectedDate, 'Duration:', durationPerSlotHours);
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
        const originalScheduleBtnState = scheduleBtn.disabled;
        scheduleBtn.disabled = true;

        if (!selectedSpace) { messageDiv.textContent = 'Please select a space.'; messageDiv.className = 'form-message error'; scheduleBtn.disabled = originalScheduleBtnState; return; }
        if (!selectedDate || selectedTimeSlots.size === 0) { messageDiv.textContent = 'Please select a date and at least one time slot.'; messageDiv.className = 'form-message error'; scheduleBtn.disabled = originalScheduleBtnState; return; }
        if (!bookedByInput.value.trim()) { messageDiv.textContent = 'Please enter who is booking the space.'; messageDiv.className = 'form-message error'; scheduleBtn.disabled = originalScheduleBtnState; return; }

        if (!availabilityStatusBox.classList.contains('available') && !availabilityStatusBox.classList.contains('partially-booked')) {
            if (!confirm("Availability status is not marked as 'Available' or 'Partially Booked'. This might result in a double booking. Do you still want to proceed?")) {
                messageDiv.textContent = 'Booking cancelled by user.'; messageDiv.className = 'form-message notice';
                scheduleBtn.disabled = originalScheduleBtnState;
                return;
            }
        }

        const sortedSlots = Array.from(selectedTimeSlots).sort();
        const firstSlotStartStr = sortedSlots[0];
        const lastSlotStartStr = sortedSlots[sortedSlots.length - 1];

        const [firstPayloadH, firstPayloadM] = firstSlotStartStr.split(':').map(Number);
        const overallStartTimeForPayload = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), firstPayloadH, firstPayloadM);

        const lastSlotEndTimeStrForPayload = getTimeSlotEnd(lastSlotStartStr, durationPerSlotHours);
        const [lastPayloadEndH, lastPayloadEndM] = lastSlotEndTimeStrForPayload.split(':').map(Number);
        const overallEndTimeForPayload = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), lastPayloadEndH, lastPayloadEndM);

        const bookingPayload = {
            'Space': selectedSpace,
            'BookedBy': bookedByInput.value.trim(),
            'PurposeNotes': purposeTextarea.value.trim(),
            'SendConfirmation': sendConfirmationCheckbox.checked,

            'BookingDateTime': {
                'SelectedDate_YYYYMMDD': selectedDate.toISOString().split('T')[0],
                'StartTime_UTC': overallStartTimeForPayload.toISOString(),
                'EndTime_UTC': overallEndTimeForPayload.toISOString(),
                'StartTime_Local_Display': formatTime(overallStartTimeForPayload),
                'EndTime_Local_Display': formatTime(overallEndTimeForPayload),
            },
            'BookingDuration': {
                'DurationPerSlot_Hours': durationPerSlotHours,
                'TotalDuration_Hours': parseFloat(hiddenTotalDurationHoursInput.value),
                'TotalDuration_Minutes': parseFloat(hiddenTotalDurationHoursInput.value) * 60,
            },
            'BookedTimeSlots_CSV': sortedSlots.join(', '),
        };

        console.log("Payload to Zapier:", JSON.stringify(bookingPayload, null, 2));

        try {
            const response = await fetch(ZAPIER_SUBMIT_BOOKING_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bookingPayload)
            });

            messageDiv.className = 'form-message';

            if (response.ok) {
                const result = await response.json();
                console.log("Booking submission result from Zapier:", result);
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
                try {
                    const errorData = await response.json();
                    if (errorData && (errorData.message || errorData.error)) { errorMsg += ` ${errorData.message || errorData.error}`; }
                } catch (e) { console.warn("Could not parse JSON error response from booking submission:", e);}
                messageDiv.textContent = errorMsg;
                messageDiv.classList.add('error');
            }
        } catch (error) { // Removed underscore from catch variable
            console.error('Network or other error during booking submission:', error);
            messageDiv.textContent = 'Network error during booking. ' + error.message;
            messageDiv.className = 'form-message error';
        } finally {
            if (messageDiv.classList.contains('error')) {
                if (availabilityStatusBox.classList.contains('available') || availabilityStatusBox.classList.contains('partially-booked')) {
                    scheduleBtn.disabled = false;
                } else {
                    scheduleBtn.disabled = true;
                }
            }
            // On success, resetFormAndSelections handles disabling the button.
        }
    });

    function resetFormAndSelections() {
        console.log("Resetting form and selections.");
        spaceBookingForm.reset();
        sendConfirmationCheckbox.checked = true;

        selectedSpace = spaceSelectInput.options.length > 0 ? spaceSelectInput.options[0].value : ""; // Reset to first option or empty
        spaceSelectInput.value = selectedSpace;

        selectedDate = null;
        selectedTimeSlots.clear();

        durationPerSlotHours = durationSelect.options.length > 0 ? parseFloat(durationSelect.options[0].value) : 0.5;
        durationSelect.value = durationPerSlotHours;
        if(isNaN(durationPerSlotHours)) durationPerSlotHours = 0.5; // fallback

        const prevSelectedDay = calendarDaysGrid.querySelector('.selected-day');
        if (prevSelectedDay) prevSelectedDay.classList.remove('selected-day');

        document.querySelectorAll('.time-slot-item.selected-time').forEach(el => el.classList.remove('selected-time'));
        document.querySelectorAll('.time-slot-item.externally-booked').forEach(el => {
            el.classList.remove('externally-booked');
            const cb = el.querySelector('input[type="checkbox"]');
            if (cb && !cb.parentElement.classList.contains('disabled')) cb.disabled = false;
        });
        document.querySelectorAll('.time-slot-item input[type="checkbox"]').forEach(cb => cb.checked = false);

        renderTimeSlots();
        updateSummary();
        resetAvailabilityStatus();
        messageDiv.textContent = ''; messageDiv.className = 'form-message';
    }

    // --- INITIAL RENDER ---
    console.log("Initializing booking system. Default duration:", durationPerSlotHours);
    if (isNaN(durationPerSlotHours) && durationSelect.options.length > 0) { // Ensure durationPerSlotHours is valid on init
        durationPerSlotHours = parseFloat(durationSelect.options[0].value);
         if(isNaN(durationPerSlotHours)) durationPerSlotHours = 0.5; // Final fallback
    } else if (isNaN(durationPerSlotHours)) {
        durationPerSlotHours = 0.5; // Absolute fallback if no options
    }


    renderCalendar();
    renderTimeSlots(); // Will show placeholder initially as no date is selected
    updateSummary();   // Will show "Select..." initially
    resetAvailabilityStatus(); // Will disable scheduleBtn initially
});
