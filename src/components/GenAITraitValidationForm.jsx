import React, { useState, useEffect, useRef, useCallback } from 'react';
import Select from 'react-select';
import './GenAITraitValidationForm.css';

const GenAITraitValidationForm = () => {
  // Possible traits for the API-driven possible traits table
  const [possibleTraits, setPossibleTraits] = useState([]);
  const [isLoadingTraits, setIsLoadingTraits] = useState(false);
  const [traitsError, setTraitsError] = useState(null);

  useEffect(() => {
    const fetchTraits = async () => {
      setIsLoadingTraits(true);
      setTraitsError(null);
      try {
        const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits`);
        if (!response.ok) throw new Error(`Failed: ${response.status}`);
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setPossibleTraits(result.data);
        } else {
          setPossibleTraits([]);
          setTraitsError('Could not load traits from API.');
        }
      } catch (err) {
        setTraitsError('Error fetching traits: ' + err.message);
        setPossibleTraits([]);
      } finally {
        setIsLoadingTraits(false);
      }
    };
    fetchTraits();
  }, []);

  const getInitialFormState = () => ({
    version: 'basic',
    project_input: '',
    concept_input: '',
    projectId: ''
  });

  const [formData, setFormData] = useState(getInitialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Trait feedback modal state
  const [selectedTraitFeedback, setSelectedTraitFeedback] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [selectedRowForFeedback, setSelectedRowForFeedback] = useState(null);
  const [selectedTraitsFromList, setSelectedTraitsFromList] = useState(null);
  const [shouldExist, setShouldExist] = useState(1);
  const [isTraitValidationIncorrect, setIsTraitValidationIncorrect] = useState(0);

  // WebSocket states
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    if (selectedTraitFeedback) {

      setIsTraitValidationIncorrect(selectedTraitFeedback.finalScore === 1 ? 1 : 0);
      setFeedbackText(selectedTraitFeedback.feedback || '');
    } else {
      setFeedbackText('');
      setIsTraitValidationIncorrect(0);
    }
  }, [selectedTraitFeedback]);
  const wsRef = useRef(null);

  // CSV upload states
  const [csvFile, setCsvFile] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [csvPreview, setCsvPreview] = useState([]);
  const [useCsv, setUseCsv] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  // CSV file handler
  const handleCsvUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFile(file);
    const reader = new FileReader();

    reader.onload = (event) => {
      const text = event.target.result;
      parseCsv(text);
    };

    reader.readAsText(file);
  };

  // Parse CSV to JSON
  const parseCsv = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length === 0) return;

    // Get headers
    const headers = lines[0].split(',').map(h => h.trim());
    setCsvColumns(headers);

    // Validate required columns
    const requiredColumns = ['Context Prompt', 'Initial Reaction', 'Hunch ID', 'Concept Name'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));

    if (missingColumns.length > 0) {
      alert(`Missing required columns: ${missingColumns.join(', ')}`);
      setCsvFile(null);
      setCsvData([]);
      setCsvPreview([]);
      return;
    }

    // Parse data rows
    const parsedData = [];
    const previewData = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      if (values.length !== headers.length) continue;

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      parsedData.push(row);

      // Store first 5 rows for preview
      if (i <= 5) {
        previewData.push(row);
      }
    }

    setCsvData(parsedData);
    setCsvPreview(previewData);
    setUseCsv(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiResponse(null);

    let apiData;

    // If CSV is selected, send CSV data as JSON array
    if (useCsv && csvData.length > 0) {
      apiData = {
        version: formData.version,
        project_id: formData.projectId,
        csv_data: csvData.map(row => ({
          context_prompt: row['Context Prompt'] || '',
          initial_reaction: row['Initial Reaction'] || '',
          hunch_id: row['Hunch ID'] || '',
          concept_name: row['Concept Name'] || '',
        }))
      };

      // If version is context, also include project_input and concept_input
      if (formData.version === 'context') {
        apiData.project_input = formData.project_input.trim();
        apiData.concept_input = formData.concept_input.trim();
      }
    } else {
      // Original form submission
      apiData = {
        version: formData.version,
        project_id: formData.projectId
      };

      if (formData.version === 'context') {
        apiData.project_input = formData.project_input.trim();
        apiData.concept_input = formData.concept_input.trim();
      }
    }

    try {
      const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(apiData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Form submission response:', result);

      // Set API response to show in response table
      setApiResponse(result);

      // Start showing the processing loader
      setIsProcessing(true);

      // If result has data array, also add to Traits Database table
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        setTableData(prev => {
          // Merge new data with existing, avoiding duplicates
          const existingIds = new Set(prev.map(item => item._id));
          const newItems = result.data.filter(item => !existingIds.has(item._id));
          return [...prev, ...newItems];
        });
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      let errorMessage = error.message;

      if (error.message === 'Failed to fetch') {
        errorMessage = 'Failed to connect to the API server. Please ensure:\n\n' +
          '1. The backend server is running on http://localhost:8000\n' +
          '2. The server has CORS enabled to accept requests fromhttps://hunchgenaitest-320866101884.us-central1.run.app\n' +
          '3. The /batch_classify endpoint is accessible';
      }

      setApiResponse({ error: errorMessage });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData(getInitialFormState());
    setApiResponse(null);
    setCsvFile(null);
    setCsvData([]);
    setCsvColumns([]);
    setCsvPreview([]);
    setUseCsv(false);
    // Reset file input
    const fileInput = document.getElementById('csvUpload');
    if (fileInput) fileInput.value = '';
  };

  // Function to analyze traits and identify changes
  const analyzeTraits = (item, type) => {
    const reactionData = type === 'initial_reaction' ? item.initial_reaction : item.context_prompt;
    if (!reactionData) return null;

    const originalTraits = reactionData.traits || [];
    const genAiRecords = reactionData.genAiRecords || [];

    // Create a map of trait names to their scores
    const traitMap = new Map();
    genAiRecords.forEach(record => {
      const llmScore = record.llmScore || 0;
      const finalScore = record.finalScore || 0;
      traitMap.set(record.traitTitle, {
        llmScore,
        finalScore
      });
    });

    // Identify changes
    const addedTraits = [];
    const removedTraits = [];
    const unchangedTraits = [];

    // Check all traits in genAiRecords
    traitMap.forEach((scores, traitName) => {
      if (scores.llmScore === 1 && scores.finalScore === 1) {
        // Unchanged - was in original and GenAI confirmed
        unchangedTraits.push(traitName);
      } else if (scores.llmScore === 1 && scores.finalScore === 0) {
        // Removed - was in original but GenAI says no
        removedTraits.push(traitName);
      } else if (scores.llmScore === 0 && scores.finalScore === 1) {
        // Added - wasn't in original but GenAI says yes
        addedTraits.push(traitName);
      }
    });

    // Also check original traits that might not be in genAiRecords
    originalTraits.forEach(traitName => {
      if (!traitMap.has(traitName)) {
        // Trait in original but not analyzed by GenAI
        unchangedTraits.push(traitName);
      }
    });

    return {
      originalTraits: originalTraits.join('; '),
      addedTraits: addedTraits.join('; '),
      removedTraits: removedTraits.join('; '),
      unchangedTraits: unchangedTraits.join('; '),
      hasChanges: addedTraits.length > 0 || removedTraits.length > 0,
      totalOriginal: originalTraits.length,
      totalAdded: addedTraits.length,
      totalRemoved: removedTraits.length
    };
  };

  const handleRowClick = (row) => {
    // console.log('row', row);
    setSelectedRowForFeedback(row);
    setSelectedTraitsFromList([]);
    setFeedbackText('');
  };

  // Escape CSV cell: wrap in quotes and escape internal quotes
  const csvEscape = (val) => {
    if (val == null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  // Download as CSV – Trait Guide 2.0 format (17 columns, one row per trait).
  // Per spec: combine feedback from both modals into Corrective Feedback column only; Project ID as entered.
  const handleDownloadCSV = () => {
    if (tableData.length === 0) {
      alert('No data to export');
      return;
    }

    const headers = [
      'Trait',
      'Reaction Type',
      'Initial Reaction',
      'Context Prompt',
      'Hunch LLM Score',
      'Gen AI Score',
      'Gen AI Score Confidence',
      'Gen AI Confidence Status',
      'Gen AI Rationale',
      'Correct Final Score',
      'Corrective Feedback',
      'Missing Trait Feedback',
      'Row Number',
      'Project ID',
      'Concept Name',
      'Hunch ID',
      'Version'
    ];
    const csvRows = [headers.map(csvEscape).join(',')];
    // Project ID exactly as entered in the inputs
    // const projectId = formData.projectId || '';

    tableData.forEach((item, rowIndex) => {
      const tableRowNumber = rowIndex + 1; // same as "No" in the table below Decision criteria
      const initialReactionText = (item.initial_reaction?.text || '').trim();
      const contextPromptText = (item.context_prompt?.text || '').trim();
      const conceptName = item.concept_name ?? '';
      const hunchId = item.hunch_id ?? '';
      const version = item.version ?? '';
      const projectId = item.project_id || '';

      const emitRow = (record, reactionType) => {
        const llmScore = record.llmScore ?? 0;
        const genAiScore = record.genAiSays?.score ?? 0;
        const confidence = record.genAiSays?.confidence ?? null;
        const finalScore = record.finalScore ?? 0;
        const rationale = record.genAiSays?.rationale ?? '';
        const feedback = (record.feedback || record.genAiSays?.feedback || '').trim();

        // 0/0 with feedback or score change via feedback → Missing Trait Feedback; else → Corrective Feedback
        const isZeroZeroWithFeedback = llmScore === 0 && genAiScore === 0;
        const correctiveFeedback = isZeroZeroWithFeedback ? '' : feedback;
        const missingTraitFeedback = isZeroZeroWithFeedback ? feedback : '';

        let confidenceStatus = '';
        if (record.genAiSays == null || (record.genAiSays?.score == null && record.genAiSays?.confidence == null)) {
          confidenceStatus = 'Trait Missing Not Scored';
        } else if (confidence != null && confidence >= 0.8) {
          confidenceStatus = 'Gen AI is Confident';
        } else if (confidence != null && confidence < 0.8) {
          confidenceStatus = 'GenAI is Unsure (Low Confidence)';
        }

        const genAiScoreDisplay = genAiScore === 1 ? '1' : String(genAiScore);
        const confidenceDisplay = confidence != null ? (Math.round(confidence * 100) + '%') : '';

        const rawTitle = record.traitTitle || '';
        const traitDisplay = (record.llmScore === 1 && record.finalScore === 0)
          ? (rawTitle.trim().startsWith('(') ? rawTitle : `(${rawTitle})`)
          : rawTitle;

        const row = [
          csvEscape(traitDisplay),
          csvEscape(reactionType),
          csvEscape(initialReactionText),
          csvEscape(contextPromptText),
          llmScore,
          genAiScoreDisplay,
          csvEscape(confidenceDisplay),
          csvEscape(confidenceStatus),
          csvEscape(rationale),
          finalScore,
          csvEscape(correctiveFeedback),
          csvEscape(missingTraitFeedback),
          tableRowNumber,
          csvEscape(projectId),
          csvEscape(conceptName),
          csvEscape(hunchId),
          csvEscape(version)
        ];
        csvRows.push(row.join(','));
      };

      processTraitsForExport(item.initial_reaction?.genAiRecords || []).forEach((record) => emitRow(record, 'Initial Reaction'));
      processTraitsForExport(item.context_prompt?.genAiRecords || []).forEach((record) => emitRow(record, 'Context Prompt'));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `Trait_Guide_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStatusToggle = async (id, currentStatus) => {
    const isCurrentlyReviewed = Boolean(currentStatus);
    const newStatus = !isCurrentlyReviewed;
    console.log(`Toggling status for ${id}: ${isCurrentlyReviewed} -> ${newStatus}`);

    const updateItems = (items, status) => {
      if (!Array.isArray(items)) return items;
      return items.map(item => {
        if (String(item._id) === String(id)) {
          return { ...item, isReviewed: status, review_status: status };
        }
        return item;
      });
    };

    // Robust state updates
    setTableData(prev => updateItems(prev, newStatus));

    setApiResponse(prev => {
      if (!prev) return prev;
      if (Array.isArray(prev)) return updateItems(prev, newStatus);
      if (prev.data && Array.isArray(prev.data)) return { ...prev, data: updateItems(prev.data, newStatus) };
      if (prev.results && Array.isArray(prev.results)) return { ...prev, results: updateItems(prev.results, newStatus) };
      return prev;
    });

    try {
      const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: id, isReviewed: newStatus })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Status update result:', result);

      if (result.success && result.data) {
        const finalUpdate = (items) => {
          if (!Array.isArray(items)) return items;
          return items.map(item => {
            if (String(item._id) === String(id)) {
              const updatedRecord = { ...result.data };
              if (updatedRecord.review_status === undefined && updatedRecord.isReviewed === undefined) {
                updatedRecord.review_status = newStatus;
                updatedRecord.isReviewed = newStatus;
              }
              return updatedRecord;
            }
            return item;
          });
        };

        setTableData(prev => finalUpdate(prev));

        setApiResponse(prev => {
          if (!prev) return prev;
          if (Array.isArray(prev)) return finalUpdate(prev);
          if (prev.data && Array.isArray(prev.data)) return { ...prev, data: finalUpdate(prev.data) };
          if (prev.results && Array.isArray(prev.results)) return { ...prev, results: finalUpdate(prev.results) };
          return prev;
        });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      setTableData(prev => updateItems(prev, isCurrentlyReviewed));
      setApiResponse(prev => {
        if (!prev) return prev;
        if (Array.isArray(prev)) return updateItems(prev, isCurrentlyReviewed);
        if (prev.data && Array.isArray(prev.data)) return { ...prev, data: updateItems(prev.data, isCurrentlyReviewed) };
        if (prev.results && Array.isArray(prev.results)) return { ...prev, results: updateItems(prev.results, isCurrentlyReviewed) };
        return prev;
      });
      alert(`Failed to update status: ${error.message}`);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    setTableError(null);

    try {
      const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Clear the table data
      setTableData([]);
    } catch (error) {
      console.error('Error deleting data:', error);
      setTableError(`Failed to delete data: ${error.message}`);
      alert(`Error: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // ... existing useEffect and getTraitStatus functions remain the same ...

  useEffect(() => {
    const fetchTableData = async () => {
      setIsLoadingTable(true);
      setTableError(null);
      try {
        const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success && result.data) {
          setTableData(result.data);
        } else {
          setTableError('Failed to fetch data');
        }
      } catch (error) {
        console.error('Error fetching table data:', error);
        setTableError(error.message);
      } finally {
        setIsLoadingTable(false);
      }
    };

    fetchTableData();
  }, []);

  // Function to refetch table data
  const refetchTableData = async () => {
    setIsLoadingTable(true);
    setTableError(null);
    try {
      const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      if (result.success && result.data) {
        setTableData(result.data);
      } else {
        setTableError('Failed to fetch data');
      }
    } catch (error) {
      console.error('Error fetching table data:', error);
      setTableError(error.message);
    } finally {
      setIsLoadingTable(false);
    }
  };

  // Handle WebSocket updates
  const handleWebSocketUpdate = useCallback((data) => {
    switch (data.type) {
      case 'connected':
        console.log('Connection established:', data.message);
        break;

      case 'processing_started':
        console.log('Processing started:', data);
        // Show processing status in response
        if (apiResponse) {
          setApiResponse(prev => ({
            ...prev,
            processing: true,
            status: 'Processing started...',
            totalItems: data.totalItems
          }));
        }
        break;

      case 'document_created':
        console.log('Document created:', data);
        // Add new document to Traits Database table
        if (data.document) {
          setTableData(prev => {
            // Check if document already exists
            const exists = prev.some(doc => doc._id === data.document._id);
            if (!exists) {
              return [...prev, data.document];
            }
            return prev;
          });

          // Also update response table if this document is part of current response
          if (apiResponse && apiResponse.data) {
            setApiResponse(prev => {
              if (prev.data && Array.isArray(prev.data)) {
                const exists = prev.data.some(doc => doc._id === data.document._id);
                if (!exists) {
                  return {
                    ...prev,
                    data: [...prev.data, data.document]
                  };
                }
              }
              return prev;
            });
          }
        }
        break;

      case 'trait_added':
      case 'trait_removed':
      case 'trait_updated':
        console.log('Trait update:', data.type, data);
        // Update existing document in Traits Database table
        if (data.document && data.documentId) {
          setTableData(prev =>
            prev.map(doc =>
              doc._id === data.documentId ? data.document : doc
            )
          );

          // Also update response table if this document is part of current response
          if (apiResponse && apiResponse.data) {
            setApiResponse(prev => {
              if (prev.data && Array.isArray(prev.data)) {
                return {
                  ...prev,
                  data: prev.data.map(doc =>
                    doc._id === data.documentId ? data.document : doc
                  )
                };
              }
              return prev;
            });
          }
        }
        break;

      case 'processing_completed':
        console.log('Processing completed:', data);
        // Update response status
        if (apiResponse) {
          setApiResponse(prev => ({
            ...prev,
            processing: false,
            status: 'Processing completed!',
            savedDocuments: data.savedDocuments
          }));
        }
        break;

      case 'process_completed':
        console.log('🎉 Trait prediction complete:', data);
        // Refetch the data from the database
        refetchTableData();
        // Hide the processing loader
        setIsProcessing(false);
        break;

      case 'feedback_added':
        console.log('📝 Feedback added:', data);
        // Update the row with the updated document from the server
        if (data.updatedDoc && data.documentId) {
          const updateRow = (items) => {
            if (!Array.isArray(items)) return items;
            return items.map((item) => {
              const itemId = item._id || item.id;
              if (itemId && String(itemId) === String(data.documentId)) {
                return data.updatedDoc;
              }
              return item;
            });
          };

          setTableData(prev => updateRow(prev));
          setApiResponse(prev => {
            if (!prev) return prev;
            if (Array.isArray(prev)) return updateRow(prev);
            if (prev.data && Array.isArray(prev.data)) return { ...prev, data: updateRow(prev.data) };
            if (prev.results && Array.isArray(prev.results)) return { ...prev, results: updateRow(prev.results) };
            return prev;
          });
        }
        break;

      case 'task_queued':
        console.log('Task queued:', data);
        break;

      default:
        console.log('Unknown WebSocket message type:', data);
    }
  }, [apiResponse]);

  // WebSocket connection for live updates
  useEffect(() => {
    const wsUrl = 'wss://hunchgenaitest-320866101884.us-central1.run.app';
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('✅ WebSocket connected');
          setWsConnected(true);
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            handleWebSocketUpdate(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          console.log('❌ WebSocket disconnected');
          setWsConnected(false);
          // Auto-reconnect after 3 seconds
          reconnectTimeout = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.CLOSED) {
              connectWebSocket();
            }
          }, 3000);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setWsConnected(false);
        };
      } catch (error) {
        console.error('Error creating WebSocket:', error);
        setWsConnected(false);
      }
    };

    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [handleWebSocketUpdate]);

  const getTraitStatus = (item, traitName) => {
    const genAiRecord = item.genAiRecords?.find(record => record.traitTitle === traitName);
    if (!genAiRecord) return { color: 'grey', showTooltip: false };

    const isInReview = item.reviewTags?.includes(traitName);
    const isGreen = genAiRecord.llmScore === 0 && genAiRecord.finalScore === 1;

    if (isInReview) {
      return {
        color: 'red',
        showTooltip: true,
        rationale: genAiRecord.genAiSays?.rationale || '',
        confidence: genAiRecord.genAiSays?.confidence || 0
      };
    } else if (isGreen) {
      return { color: 'green', showTooltip: false };
    } else {
      return { color: 'grey', showTooltip: false };
    }
  };

  // Helper function to process traits from API response
  const processTraits = (genAiRecords) => {
    if (!genAiRecords || genAiRecords.length === 0) return [];

    return genAiRecords.map(record => {
      const llmScore = record.llmScore || 0;
      const finalScore = record.finalScore || 0;
      const genAiScore = record.genAiSays?.score || 0;
      const confidence = record.genAiSays?.confidence || 0;


      let icon = '';
      let color = '';
      let displayName = record.traitTitle;

      // Human feedback overrides: if trait was changed via feedback, show grey
      const isHumanFeedbackChange = String(record.action || "").toLowerCase().includes("score change via feedback") ||
        (record.feedback && record.feedback !== '');

      // Decision criteria (Hunch LLM Score, Gen AI Score, Confidence) → icon + color
      // | LLM | GenAI | Confidence | Result        |
      // |  1  |   1   |    any     | ✓ black       |
      // |  1  |   0   |   ≥ 0.80   | ✗ red         |
      // |  1  |   0   |   < 0.80   | ✗ gold/yellow |
      // |  0  |   1   |   ≥ 0.80   | + green       |
      // |  0  |   1   |   < 0.80   | + gold/yellow |
      // |  0  |   0   | feedback   | ✗ grey        |
      // |  0  |   0   | else       | not listed    |
      if (llmScore === 1 && genAiScore === 1) {
        icon = '✓';
        color = isHumanFeedbackChange ? 'grey' : 'black';
      } else if (llmScore === 1 && genAiScore === 0 && confidence >= 0.80) {
        icon = '✗';
        color = isHumanFeedbackChange ? 'grey' : 'red';
        displayName = `(${record.traitTitle})`;
      } else if (llmScore === 1 && genAiScore === 0 && confidence < 0.80) {
        icon = '✗';
        color = isHumanFeedbackChange ? 'grey' : '#d97706'; // Gold/Yellow
      } else if (llmScore === 0 && genAiScore === 0 &&
        (String(record.action || "").toLowerCase().includes("score change via feedback") ||
          record.genAiSays?.validationIncorrect === true)) {
        icon = '✗';
        color = 'grey';
      } else if (llmScore === 0 && genAiScore === 1 && confidence >= 0.80) {
        icon = '+';
        color = isHumanFeedbackChange ? 'grey' : 'green';
      } else if (llmScore === 0 && genAiScore === 1 && confidence < 0.80) {
        icon = '+';
        color = isHumanFeedbackChange ? 'grey' : '#d97706'; // Gold/Yellow
      } else {
        return null; // LLM 0, GenAI 0, no feedback – not listed
      }

      return {
        name: record.traitTitle,
        displayName,
        icon,
        color,
        rationale: record.genAiSays?.rationale || '',
        confidence: record.genAiSays?.confidence || 0,
        present: record.genAiSays?.present || false,
        llmScore: llmScore,
        finalScore: finalScore,
        action: record.action || 'No change',
        genAiScore: record.genAiSays?.score || 0,
        feedback: record.feedback || record.genAiSays?.feedback || '',
        isTraitValidationIncorrect: record.isTraitValidationIncorrect || record.genAiSays?.validationIncorrect,
        _id: record._id,
        history: record.history || []
      };
    }).filter(trait => trait !== null);
  };

  // For export only: filter genAiRecords to exclude 0/0 traits unless "score change via feedback" or feedback is non-empty
  const processTraitsForExport = (genAiRecords) => {
    if (!genAiRecords || !genAiRecords.length) return [];
    return genAiRecords.filter((record) => {
      const llm = record.llmScore ?? 0;
      const gen = record.genAiSays?.score ?? 0;
      if (llm !== 0 || gen !== 0) return true;
      const hasScoreChange = String(record.action || "").toLowerCase().includes("score change via feedback");
      const hasFb = (record.feedback && String(record.feedback).trim() !== "") || (record.genAiSays?.feedback && String(record.genAiSays.feedback).trim() !== "");
      return hasScoreChange || hasFb;
    });
  };

  // Helper function to render response table
  const renderResponseTable = () => {
    if (!apiResponse) {
      return null;
    }

    if (apiResponse.error) {
      return (
        <div className="error-box">
          <p><strong>Error:</strong> {apiResponse.error}</p>
        </div>
      );
    }

    console.log('=== RENDERING RESPONSE TABLE ===');
    console.log('API Response:', apiResponse);

    // Handle different response structures
    let dataArray = null;
    if (Array.isArray(apiResponse)) {
      dataArray = apiResponse;
    } else if (apiResponse.data && Array.isArray(apiResponse.data)) {
      dataArray = apiResponse.data;
    } else if (apiResponse.results && Array.isArray(apiResponse.results)) {
      dataArray = apiResponse.results;
    }

    console.log('Data Array:', dataArray);
    console.log('Data Array Length:', dataArray?.length);

    // Flatten data to create table rows
    // MODIFIED: We now use the raw data array directly to support the new table structure
    const tableRows = dataArray || [];


    console.log('Final Table Rows:', tableRows);
    console.log('Table Rows Count:', tableRows.length);

    if (tableRows.length === 0) {
      return (
        <div className="results-box" style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff' }}>
          <p><strong>No data to display in table.</strong></p>
          <div style={{ marginTop: '15px', fontSize: '14px', color: '#666' }}>
            <p><strong>Debug Info:</strong></p>
            <ul style={{ marginLeft: '20px' }}>
              <li>Data Array: {dataArray ? `Found ${dataArray.length} items` : 'Not found'}</li>
              <li>API Response Keys: {Object.keys(apiResponse || {}).join(', ') || 'None'}</li>
              <li>Is Array: {Array.isArray(apiResponse) ? 'Yes' : 'No'}</li>
              <li>Has data property: {apiResponse.data ? 'Yes' : 'No'}</li>
              <li>Has results property: {apiResponse.results ? 'Yes' : 'No'}</li>
            </ul>
          </div>
          <details style={{ marginTop: '15px' }}>
            <summary style={{ cursor: 'pointer', color: '#666', fontWeight: 'bold' }}>View Full Response Structure (Click to expand)</summary>
            <pre style={{
              backgroundColor: '#f5f5f5',
              padding: '15px',
              borderRadius: '4px',
              overflow: 'auto',
              maxHeight: '400px',
              fontSize: '12px',
              marginTop: '10px',
              border: '1px solid #ddd'
            }}>
              {JSON.stringify(apiResponse, null, 2)}
            </pre>
          </details>
        </div>
      );
    }

    return (
      <div className="table-wrapper" style={{ marginTop: '20px' }}>
        <div style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          backgroundColor: 'white',
          padding: '10px 5px',
          borderBottom: '1px solid #eee',
          marginBottom: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          {/* Initial Reaction Traits */}

          {/* Context Prompt Traits */}

        </div>
        <table className="traits-table" style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          background: '#fff',
          tableLayout: 'fixed'
        }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            <tr>
              <th rowSpan="2" style={{
                color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'center', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '50px', borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>No</th>
              <th rowSpan="2" style={{
                color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'left', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '100px', borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>Version</th>
              <th rowSpan="2" style={{
                color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'left', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '120px', borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>Concept Name</th>
              <th rowSpan="2" style={{
                color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'center', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '100px', borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>Review Status</th>
              <th colSpan="3" style={{
                color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'center', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '1px solid rgba(255,255,255,0.1)'
              }}>Initial Reaction</th>
              <th colSpan="3" style={{
                color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'center', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.2)'
              }}>Context Prompt</th>
            </tr>
            <tr>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '200px' }}>Text</th>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>Hunch Traits</th>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px', borderRight: '1px solid rgba(255,255,255,0.1)' }}>GenAI Validation</th>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '200px' }}>Text</th>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>Hunch Traits</th>
              <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>GenAI Validation</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((item, rowIndex) => {
              const irTraits = item.initial_reaction ? processTraits(item.initial_reaction.genAiRecords) : [];
              const cpTraits = item.context_prompt ? processTraits(item.context_prompt.genAiRecords) : [];

              const handleIRClick = (e) => {

                e.stopPropagation()
                const payload = {
                  id: `${item._id || rowIndex}_initial`,
                  version: item.version || '',
                  concept_name: item.concept_name || '',
                  type: 'INITIAL_REACTION',
                  text: item.initial_reaction?.text || '',
                  traits: irTraits,

                  timestamp: Date.now()

                };
                handleRowClick(payload);
              };

              const handleCPClick = (e) => {
                e.stopPropagation();
                const payload = {
                  id: `${item._id || rowIndex}_context`,
                  version: item.version || '',
                  concept_name: item.concept_name || '',
                  type: 'CONTEXT_PROMPT',
                  text: item.context_prompt?.text || '',
                  traits: cpTraits,
                  feedback: item.context_prompt?.feedback || [],
                  timestamp: Date.now()
                };
                handleRowClick(payload);
              };

              return (
                <tr
                  key={item._id || rowIndex}
                  style={{
                    animation: `fadeInUp 0.5s ease-out ${rowIndex * 0.05}s both`,
                    transition: 'all 0.3s ease',
                    background: rowIndex % 2 === 0 ? '#fff' : '#f8f9ff'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(90deg, #f0f4ff 0%, #e8f0ff 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = rowIndex % 2 === 0 ? '#fff' : '#f8f9ff';
                  }}
                >
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', textAlign: 'center', borderRight: '1px solid #f0f0f0' }}>{rowIndex + 1}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', borderRight: '1px solid #f0f0f0' }}>{item.version}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', borderRight: '1px solid #f0f0f0' }}>{item.concept_name || '-'}</td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', textAlign: 'center', borderRight: '1px solid #f0f0f0' }}>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStatusToggle(item._id, item.review_status || item.isReviewed);
                      }}
                      style={{
                        width: '40px',
                        height: '20px',
                        backgroundColor: (item.review_status || item.isReviewed) ? '#28a745' : '#ccc',
                        borderRadius: '20px',
                        position: 'relative',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        margin: '0 auto',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        backgroundColor: '#fff',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '2px',
                        left: (item.review_status || item.isReviewed) ? '22px' : '2px',
                        transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }} />
                    </div>
                  </td>

                  {/* Initial Reaction Columns */}
                  <td onClick={handleIRClick} style={{ cursor: 'pointer', padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '11px', color: '#495057', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.initial_reaction?.text || ''}>
                    {item.initial_reaction?.text || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {irTraits.filter(t => t.llmScore === 1).length > 0 ? (
                        irTraits.filter(t => t.llmScore === 1).map((trait, index) => (
                          <span key={index} style={{
                            display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                            background: '#e9ecef', color: '#495057', border: '1px solid #dee2e6'
                          }} title={trait.name}>
                            {trait.name}
                          </span>
                        ))
                      ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', borderRight: '1px solid #f0f0f0' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {irTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').length > 0 ? (
                        irTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').map((trait, index) => (
                          <span key={index}
                            onClick={(e) => {
                              e.stopPropagation();

                              setSelectedTraitFeedback({ ...trait, documentId: item._id, type: 'INITIAL_REACTION' });
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                              background: trait.color === 'black' ? '#f8f9fa' : trait.color === 'red' ? '#fff5f5' : trait.color === 'grey' ? '#f1f3f5' : trait.color === '#d97706' ? '#fffbeb' : '#f0fff4',
                              color: trait.color, border: `1px solid ${trait.color}`, cursor: 'pointer'
                            }} title={trait.rationale}>
                            <span>{trait.icon}</span>
                            <span>{trait.displayName}</span>
                          </span>
                        ))
                      ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                    </div>
                  </td>

                  {/* Context Prompt Columns */}
                  <td onClick={handleCPClick} style={{ cursor: 'pointer', padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '11px', color: '#495057', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.context_prompt?.text || ''}>
                    {item.context_prompt?.text || '-'}
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {cpTraits.filter(t => t.llmScore === 1).length > 0 ? (
                        cpTraits.filter(t => t.llmScore === 1).map((trait, index) => (
                          <span key={index} style={{
                            display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                            background: '#e9ecef', color: '#495057', border: '1px solid #dee2e6'
                          }} title={trait.name}>
                            {trait.name}
                          </span>
                        ))
                      ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {cpTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').length > 0 ? (
                        cpTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').map((trait, index) => (
                          <span key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTraitFeedback({ ...trait, documentId: item._id, type: 'CONTEXT_PROMPT' });
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                              background: trait.color === 'black' ? '#f8f9fa' : trait.color === 'red' ? '#fff5f5' : trait.color === 'grey' ? '#f1f3f5' : trait.color === '#d97706' ? '#fffbeb' : '#f0fff4',
                              color: trait.color, border: `1px solid ${trait.color}`, cursor: 'pointer'
                            }} title={trait.rationale}>
                            <span>{trait.icon}</span>
                            <span>{trait.displayName}</span>
                          </span>
                        ))
                      ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="form-container" style={{ position: 'relative' }}>
        {/* Processing Loader Overlay */}
        {isProcessing && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            borderRadius: '12px',
            backdropFilter: 'blur(2px)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              border: '6px solid rgba(243, 243, 243, 0.5)',
              borderTop: '6px solid #667eea',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '20px'
            }} />
            <h3 style={{
              color: '#667eea',
              fontSize: '20px',
              fontWeight: '600',
              marginBottom: '10px',
              textAlign: 'center',
              textShadow: '0 2px 4px rgba(255,255,255,0.8)'
            }}>
              Trait Assigning in Process
            </h3>
            <p style={{
              color: '#333',
              fontSize: '14px',
              textAlign: 'center',
              maxWidth: '400px',
              fontWeight: '500',
              textShadow: '0 1px 2px rgba(255,255,255,0.8)'
            }}>
              Please wait while we process the data in batches. The table will automatically refresh when complete.
            </p>
            <style>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}
        <h1>GenAI Trait Validation Form</h1>
        <form onSubmit={handleSubmit} onReset={handleReset}>
          <div className="form-group">
            <label htmlFor="projectId">
              Project ID<span className="required">*</span>
            </label>
            <input
              type="text"
              id="projectId"
              name="projectId"
              value={formData.projectId}
              onChange={handleChange}
              placeholder="Enter Project ID"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="version">
              Select Type<span className="required">*</span>
            </label>
            <select
              id="version"
              name="version"
              value={formData.version}
              onChange={handleChange}
              required
            >
              <option value="basic">Basic</option>
              <option value="context">Context</option>
            </select>
          </div>

          {/* CSV Upload Section */}
          <div className="form-group">
            <label htmlFor="csvUpload">
              Upload CSV File (Optional)
            </label>
            <input
              type="file"
              id="csvUpload"
              accept=".csv"
              onChange={handleCsvUpload}
              style={{ marginBottom: '10px' }}
            />
            <small style={{ display: 'block', color: '#666', marginTop: '5px' }}>
              CSV must contain columns: context_prompt, initial_reaction, uuid
            </small>
          </div>

          {/* CSV Preview Table */}
          {csvPreview.length > 0 && (
            <div className="form-group">
              <label>CSV Preview (showing first 5 rows)</label>
              <div className="csv-preview-table">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', boxShadow: '0 2px 6px -2px rgba(0,0,0,0.10)' }}>
                    <tr style={{ backgroundColor: '#f5f5f5' }}>
                      {csvColumns.map((col, idx) => (
                        <th key={idx} style={{ padding: '8px', border: '1px solid #ddd', textAlign: 'left' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {csvColumns.map((col, colIdx) => (
                          <td key={colIdx} style={{ padding: '8px', border: '1px solid #ddd' }}>
                            {row[col] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                  Total rows: {csvData.length}
                </p>
              </div>
            </div>
          )}

          {/* Show context fields when version is context, regardless of CSV selection */}
          {formData.version === 'context' && (
            <>
              <div className="form-group">
                <label htmlFor="projectInput">
                  Project Input<span className="required">*</span>
                </label>
                <textarea
                  id="projectInput"
                  name="project_input"
                  value={formData.project_input}
                  onChange={handleChange}
                  placeholder="Enter project input..."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="conceptInput">
                  Concept Input<span className="required">*</span>
                </label>
                <textarea
                  id="conceptInput"
                  name="concept_input"
                  value={formData.concept_input}
                  onChange={handleChange}
                  placeholder="Enter concept input..."
                  required
                />
              </div>
            </>
          )}

          <div className="button-group">
            <button type="submit" className="submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
            <button type="reset" className="reset-btn" disabled={isSubmitting}>
              Reset
            </button>
          </div>
        </form>

      </div>

      <div className="table-container">
        <div className="table-container-inner" style={{ position: 'relative' }}>
          {/* Processing Loader Overlay */}


          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <h2 style={{ margin: 0 }}>Traits Database</h2>
              <span
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  backgroundColor: wsConnected ? '#d4edda' : '#f8d7da',
                  color: wsConnected ? '#155724' : '#721c24',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title={wsConnected ? 'WebSocket Connected - Live Updates Active' : 'WebSocket Disconnected - No Live Updates'}
              >
                <span>{wsConnected ? '🟢' : '🔴'}</span>
                {wsConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleDownloadCSV}
                disabled={isLoadingTable || tableData.length === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (isLoadingTable || tableData.length === 0) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: (isLoadingTable || tableData.length === 0) ? 0.6 : 1,
                  transition: 'opacity 0.3s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title={tableData.length === 0 ? 'No data to export' : 'Download data as CSV/Excel'}
              >
                <span>📥</span>
                Download CSV
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={isDeleting || isLoadingTable || tableData.length === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (isDeleting || isLoadingTable || tableData.length === 0) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: (isDeleting || isLoadingTable || tableData.length === 0) ? 0.6 : 1,
                  transition: 'opacity 0.3s'
                }}
                title={tableData.length === 0 ? 'No data to delete' : 'Delete all data from Traits Database'}
              >
                {isDeleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>

          <div className="table-wrapper" style={{ marginBottom: '20px', overflowX: 'auto' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#666', fontWeight: '600' }}>Decision criteria</h4>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #eee' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa' }}>
                  <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>LLM Score</th>
                  <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>GenAI Says</th>
                  <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>Confidence</th>
                  <th style={{ border: '1px solid #eee', padding: '6px', textAlign: 'left' }}>UI Visual Cue</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Any</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Grey fill + check‑mark</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Any</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>
                    Blank (Trait Absent)
                    <br />
                    <span style={{ fontStyle: 'italic', color: '#666' }}>
                      Note to Human Reviewer: If both Hunch LLM and GenAI are incorrect because an absent trait should be present, click on the row in the dataset in either the Initial Reaction or Context Prompt column. The Missing Trait window will pop-up for you to give corrective feedback.
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>≥ 0.80</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Red fill + ❌</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>≥ 0.80</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Green fill + ➕ </td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>&lt; 0.80</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yellow fill + ✗</td>
                </tr>
                <tr>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>No (0)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Yes (1)</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>&lt; 0.80</td>
                  <td style={{ border: '1px solid #eee', padding: '6px' }}>Gold/Yellow fill + ➕</td>
                </tr>
              </tbody>
            </table>
          </div>
          {isLoadingTable && <p className="loading-text">Loading data...</p>}
          {tableError && (
            <div className="error-box">
              <p><strong>Error:</strong> {tableError}</p>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length > 0 && (
            <div className="table-wrapper">

              <table className="traits-table" style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                background: '#fff',
                tableLayout: 'fixed'
              }}>
                <thead style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                  <tr>
                    <th rowSpan="2" style={{
                      color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'center', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '50px', borderRight: '1px solid rgba(255,255,255,0.1)'
                    }}>No</th>
                    <th rowSpan="2" style={{
                      color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'left', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '100px', borderRight: '1px solid rgba(255,255,255,0.1)'
                    }}>Version</th>
                    <th rowSpan="2" style={{
                      color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'left', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '120px', borderRight: '1px solid rgba(255,255,255,0.1)'
                    }}>Concept Name</th>
                    <th rowSpan="2" style={{
                      color: '#fff', fontWeight: '600', padding: '12px 8px', textAlign: 'center', fontSize: '12px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '100px', borderRight: '2px solid rgba(255,255,255,0.3)'
                    }}>Review Status</th>
                    <th colSpan="3" style={{
                      color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'center', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.2)', borderRight: '2px solid rgba(255,255,255,0.3)'
                    }}>Initial Reaction</th>
                    <th colSpan="3" style={{
                      color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'center', fontSize: '13px', borderBottom: '1px solid rgba(255,255,255,0.2)'
                    }}>Context Prompt</th>
                  </tr>
                  <tr>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '200px' }}>Text</th>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>Hunch Traits</th>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px', borderRight: '2px solid rgba(255,255,255,0.3)' }}>GenAI Validation</th>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '200px' }}>Text</th>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>Hunch Traits</th>
                    <th style={{ color: '#fff', fontWeight: '600', padding: '8px', textAlign: 'left', fontSize: '11px', borderBottom: '2px solid rgba(255,255,255,0.2)', width: '150px' }}>GenAI Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((item, rowIndex) => {
                    const irTraits = item.initial_reaction ? processTraits(item.initial_reaction.genAiRecords) : [];
                    const cpTraits = item.context_prompt ? processTraits(item.context_prompt.genAiRecords) : [];

                    const handleIRClick = (e) => {
                      e.stopPropagation();
                      const payload = {
                        id: `${item._id || rowIndex}_initial`,
                        version: item.version || '',
                        concept_name: item.concept_name || '',
                        type: 'INITIAL_REACTION',
                        text: item.initial_reaction?.text || '',
                        traits: irTraits,
                        timestamp: Date.now(),
                        feedback: item.initial_reaction?.genAiRecords
                          ? item.initial_reaction.genAiRecords
                            .filter(r => String(r.action || "").toLowerCase().includes("score change via feedback"))
                            .map(r => ({
                              text: r.feedback,
                              trait: r.traitTitle,
                              shouldExist: r.finalScore
                            }))
                          : [],
                      };

                      handleRowClick(payload);
                    };

                    const handleCPClick = (e) => {
                      e.stopPropagation();
                      const payload = {
                        id: `${item._id || rowIndex}_context`,
                        version: item.version || '',
                        concept_name: item.concept_name || '',
                        type: 'CONTEXT_PROMPT',
                        text: item.context_prompt?.text || '',
                        traits: cpTraits,
                        feedback: item.context_prompt?.genAiRecords
                          ? item.context_prompt.genAiRecords
                            .filter(r => String(r.action || "").toLowerCase().includes("score change via feedback"))
                            .map(r => ({
                              text: r.feedback,
                              trait: r.traitTitle,
                              shouldExist: r.finalScore
                            }))
                          : [],
                        timestamp: Date.now()
                      };
                      console.log('Sending Payload (CP - DB Table):', payload);
                      handleRowClick(payload);
                    };

                    return (
                      <tr
                        key={item._id || rowIndex}
                        // onClick={() => handleRowClick(item)}
                        style={{
                          cursor: 'pointer',
                          animation: `fadeInUp 0.5s ease-out ${rowIndex * 0.05}s both`,
                          transition: 'all 0.3s ease',
                          background: rowIndex % 2 === 0 ? '#fff' : '#f8f9ff'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(90deg, #f0f4ff 0%, #e8f0ff 100%)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = rowIndex % 2 === 0 ? '#fff' : '#f8f9ff';
                        }}
                      >
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', textAlign: 'center', borderRight: '1px solid #f0f0f0' }}>{rowIndex + 1}</td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', borderRight: '1px solid #f0f0f0' }}>{item.version}</td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '12px', color: '#495057', borderRight: '1px solid #f0f0f0' }}>{item.concept_name || '-'}</td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', textAlign: 'center', borderRight: '2px solid #999' }}>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStatusToggle(item._id, item.review_status || item.isReviewed);
                            }}
                            style={{
                              width: '40px',
                              height: '20px',
                              backgroundColor: (item.review_status || item.isReviewed) ? '#28a745' : '#ccc',
                              borderRadius: '20px',
                              position: 'relative',
                              cursor: 'pointer',
                              transition: 'all 0.3s ease',
                              margin: '0 auto',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                            }}
                          >
                            <div style={{
                              width: '16px',
                              height: '16px',
                              backgroundColor: '#fff',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '2px',
                              left: (item.review_status || item.isReviewed) ? '22px' : '2px',
                              transition: 'all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }} />
                          </div>
                        </td>

                        {/* Initial Reaction Columns */}
                        <td onClick={handleIRClick} style={{ cursor: 'pointer', padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '11px', color: '#495057', lineHeight: '1.4', maxWidth: '200px' }} title="Click To Add Initial Reaction Missing Traits Feedback">
                          {item.initial_reaction?.text || '-'}
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {irTraits.filter(t => t.llmScore === 1).length > 0 ? (
                              irTraits.filter(t => t.llmScore === 1).map((trait, index) => (
                                <span key={index} style={{
                                  display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                                  background: '#e9ecef', color: '#495057', border: '1px solid #dee2e6'
                                }} title={trait.name}>
                                  {trait.name}
                                </span>
                              ))
                            ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1', borderRight: '2px solid #999' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {irTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').length > 0 ? (
                              irTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').map((trait, index) => (
                                <span key={index}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTraitFeedback({ ...trait, documentId: item._id, type: 'INITIAL_REACTION' });
                                  }}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                                    background: trait.color === 'black' ? '#f8f9fa' : trait.color === 'red' ? '#fff5f5' : trait.color === 'grey' ? '#f1f3f5' : trait.color === '#d97706' ? '#fffbeb' : '#f0fff4',
                                    color: trait.color, border: `1px solid ${trait.color}`, cursor: 'pointer'
                                  }} title={trait.rationale}>
                                  <span>{trait.icon}</span>
                                  <span>{trait.displayName}</span>
                                </span>
                              ))
                            ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                          </div>
                        </td>

                        {/* Context Prompt Columns */}
                        <td onClick={handleCPClick} style={{ cursor: 'pointer', padding: '10px 8px', borderBottom: '1px solid #e8ecf1', fontSize: '11px', color: '#495057', lineHeight: '1.4', maxWidth: '200px' }} title="Click to Add Context Prompt Missing Traits Feedback">
                          {item.context_prompt?.text || '-'}
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {cpTraits.filter(t => t.llmScore === 1).length > 0 ? (
                              cpTraits.filter(t => t.llmScore === 1).map((trait, index) => (
                                <span key={index} style={{
                                  display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                                  background: '#e9ecef', color: '#495057', border: '1px solid #dee2e6'
                                }} title={trait.name}>
                                  {trait.name}
                                </span>
                              ))
                            ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                          </div>
                        </td>
                        <td style={{ padding: '10px 8px', borderBottom: '1px solid #e8ecf1' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {cpTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').length > 0 ? (
                              cpTraits.filter(t => t.finalScore === 1 || (t.llmScore === 1 && t.finalScore === 0) || t.color === 'grey' || t.color === '#d97706').map((trait, index) => (
                                <span key={index}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTraitFeedback({ ...trait, documentId: item._id, type: 'CONTEXT_PROMPT' });
                                  }}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 6px', borderRadius: '4px', fontSize: '10px',
                                    background: trait.color === 'black' ? '#f8f9fa' : trait.color === 'red' ? '#fff5f5' : trait.color === 'grey' ? '#f1f3f5' : trait.color === '#d97706' ? '#fffbeb' : '#f0fff4',
                                    color: trait.color, border: `1px solid ${trait.color}`, cursor: 'pointer'
                                  }} title={trait.rationale}>
                                  <span>{trait.icon}</span>
                                  <span>{trait.displayName}</span>
                                </span>
                              ))
                            ) : <span style={{ color: '#ccc', fontSize: '10px' }}>-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length === 0 && (
            <p className="no-data-text">No data available</p>
          )}
        </div>
      </div>

      {/* Trait Feedback Modal */}
      {selectedTraitFeedback && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => {
            setSelectedTraitFeedback(null);
            setIsTraitValidationIncorrect(0);
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px', color: selectedTraitFeedback.color }}>
                  {selectedTraitFeedback.icon}
                </span>
                <span>Trait Feedback: {selectedTraitFeedback.name}</span>
              </h2>
              <button
                onClick={() => {
                  setSelectedTraitFeedback(null);
                  setIsTraitValidationIncorrect(0);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>



            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666', display: 'block', marginBottom: '8px' }}>GenAI Score Confidence:</strong>
              <div style={{ marginTop: '5px' }}>
                <div style={{
                  width: '100%',
                  height: '24px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <div style={{
                    width: `${(selectedTraitFeedback.confidence || 0) * 100}%`,
                    height: '100%',
                    backgroundColor: selectedTraitFeedback.confidence >= 0.8 ? '#28a745' :
                      selectedTraitFeedback.confidence >= 0.6 ? '#ffc107' : '#dc3545',
                    transition: 'width 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                  }}>
                    {((selectedTraitFeedback.confidence || 0) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666', fontSize: '16px', borderBottom: '2px solid #eee', paddingBottom: '5px', display: 'block', marginBottom: '10px' }}>Results</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#555' }}>Hunch LLM Score:</span>
                  <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                    {selectedTraitFeedback.llmScore === 1 ? 'Yes' : 'No'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#555' }}>GenAI Score:</span>
                  <span style={{ fontWeight: 'bold', fontSize: '15px', color: '#333' }}>
                    {selectedTraitFeedback.genAiScore === 1 ? 'Yes' : 'No'}
                  </span>
                </div>
                {/* <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <span style={{ color: '#555' }}>Current Score:</span>
                  <span style={{ fontWeight: 'bold', fontSize: '15px', color: selectedTraitFeedback.finalScore === 1 ? '#28a745' : '#dc3545' }}>
                    {selectedTraitFeedback.finalScore === 1 ? 'Yes' : 'No'}
                  </span>
                </div> */}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666' }}>GenAI Confidence Status:</strong>
              <p style={{ margin: '5px 0 0 0', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontStyle: 'italic', color: '#555' }}>
                {selectedTraitFeedback.confidence >= 0.8 ? 'GenAI is Confident' : 'GenAI is Unsure (Low Confidence)'}
              </p>
            </div>



            {/* <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666' }}>GenAI Present:</strong>
              <p style={{ margin: '5px 0 0 0', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                {selectedTraitFeedback.present ? 'Yes' : 'No'}
              </p>
            </div> */}

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666', display: 'block', marginBottom: '5px' }}>Rationale:</strong>
              <p style={{
                margin: '0',
                padding: '12px',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px',
                lineHeight: '1.6',
                whiteSpace: 'pre-wrap',
                border: '1px solid #e0e0e0',
                fontSize: '14px'
              }}>
                {selectedTraitFeedback.rationale || 'No rationale provided'}
              </p>
            </div>

            <div style={{ marginTop: '25px', borderTop: '2px dashed #ddd', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👉</span> Human Review
              </h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px', fontStyle: 'italic' }}>
                Provide feedback when Gen AI is incorrect or unsure, and explain the proper rationale for the correct score              </p>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ color: '#666', display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Feedback:
                </label>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Enter your feedback..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '10px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <strong style={{ color: '#666', display: 'block', marginBottom: '5px' }}>Correct Final Score:</strong>
                <select
                  value={isTraitValidationIncorrect}
                  onChange={(e) => setIsTraitValidationIncorrect(parseInt(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    fontSize: '14px',
                    backgroundColor: 'white'
                  }}
                >
                  <option value="" disabled>Select Final Score</option>
                  <option value={1}>1</option>
                  <option value={0}>0</option>
                </select>
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px', fontStyle: 'italic' }}>
                  1 indicates this trait should be present, a 0 indicates this trait should not be present.
                </p>
              </div>

              {/* Activity History Section */}
              {selectedTraitFeedback.history && selectedTraitFeedback.history.length > 0 && (
                <div style={{ marginTop: '20px', borderTop: '1px solid #e0e0e0', paddingTop: '15px' }}>
                  <strong style={{ color: '#666', display: 'block', marginBottom: '10px', fontSize: '14px' }}>
                    📋 Activity History
                  </strong>
                  <div style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    {selectedTraitFeedback.history.map((item, idx) => (
                      <div key={idx} style={{
                        padding: '10px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        fontSize: '13px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                          <span style={{
                            fontWeight: 'bold',
                            color: item.finalScore === 1 ? '#28a745' : '#dc3545'
                          }}>
                            Final Score: {item.finalScore}
                          </span>
                          <span style={{
                            fontSize: '11px',
                            color: '#999',
                            fontStyle: 'italic'
                          }}>
                            {item.timestamp ? new Date(item.timestamp).toLocaleString() : ''}
                          </span>
                        </div>
                        <div style={{ marginBottom: '5px', color: '#555' }}>
                          <strong>Action:</strong> {item.action || 'N/A'}
                        </div>
                        {item.feedback && (
                          <div style={{ color: '#666', fontStyle: 'italic' }}>
                            <strong>Feedback:</strong> {item.feedback}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setSelectedTraitFeedback(null);
                  setFeedbackText('');
                  setIsTraitValidationIncorrect(0);
                }}
                disabled={isSubmittingFeedback}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmittingFeedback ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: isSubmittingFeedback ? 0.6 : 1
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!selectedTraitFeedback) return;
                  setIsSubmittingFeedback(true);

                  try {
                    // TODO: Replace with actual API endpoint
                    const response = await fetch(`https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/feedback`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        traitName: selectedTraitFeedback.name,
                        feedback: feedbackText,
                        documentId: selectedTraitFeedback.documentId,
                        genAiRecordId: selectedTraitFeedback._id,
                        type: selectedTraitFeedback.type,
                        isTraitValidationIncorrect: isTraitValidationIncorrect
                      })
                    });

                    if (!response.ok) {
                      throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();

                    // Row will be updated via WebSocket 'feedback_added' event
                    if (result.success) {
                      console.log('Feedback submitted successfully, waiting for WebSocket update...');
                    }

                    setSelectedTraitFeedback(null);
                    setFeedbackText('');
                    setIsTraitValidationIncorrect(0);
                  } catch (error) {
                    console.error('Error submitting feedback:', error);
                    alert(`Error submitting feedback: ${error.message}`);
                  } finally {
                    setIsSubmittingFeedback(false);
                  }
                }}
                disabled={isSubmittingFeedback}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmittingFeedback ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: isSubmittingFeedback ? 0.6 : 1
                }}
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit Correction'}
              </button>
            </div>
          </div>
        </div>
      )}
      {console.log('Selected Row For Feedback:', selectedRowForFeedback)}
      {/* Row Click Feedback Modal */}
      {selectedRowForFeedback && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setSelectedRowForFeedback(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '30px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Missing Trait Feedback</h2>
              <button
                onClick={() => setSelectedRowForFeedback(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '0',
                  width: '30px',
                  height: '30px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <strong style={{ display: 'block', marginBottom: '8px', color: '#333' }}>Text:</strong>
              <div style={{
                padding: '12px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                fontSize: '14px',
                lineHeight: '1.5',
                color: '#495057',
                maxHeight: '150px',
                overflowY: 'auto'
              }}>
                {selectedRowForFeedback.text || <span style={{ color: '#999' }}>No text available</span>}
              </div>
            </div>
            {selectedRowForFeedback.feedback && selectedRowForFeedback.feedback.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <strong style={{ display: 'block', marginBottom: '8px', color: '#333' }}>Existing Feedback:</strong>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '4px'
                }}>
                  {selectedRowForFeedback.feedback.map((fb, idx) => (
                    <div key={idx} style={{
                      padding: '10px',
                      backgroundColor: '#fff',
                      border: '1px solid #e0e0e0',
                      borderRadius: '6px',
                      fontSize: '13px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 'bold', color: '#667eea' }}>{fb.trait}</span>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          backgroundColor: fb.shouldExist ? '#d4edda' : '#f8d7da',
                          color: fb.shouldExist ? '#155724' : '#721c24'
                        }}>
                          {fb.shouldExist ? 'Should Exist' : 'Should Not Exist'}
                        </span>
                      </div>
                      <div style={{ color: '#555', fontStyle: fb.text ? 'normal' : 'italic' }}>
                        {fb.text || 'No feedback text provided'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Select Trait:
              </label>

              <Select
                options={(() => {
                  // Define the custom order
                  const traitOrder = [
                    "Niche (Prompted)",
                    "Expressive",
                    "Positivity",
                    "Intuitive",
                    "(INTUITIVE) Flavor Appeal",
                    "(INTUITIVE) Good Brand",
                    "(INTUITIVE) Ingredient Appeal",
                    "(INTUITIVE) Makes Life Easier",
                    "Emotive Delight",
                    "(EMOTIVE DELIGHT) Brand Love",
                    "(EMOTIVE DELIGHT) Enticing",
                    "(EMOTIVE DELIGHT) Flavor Love",
                    "(EMOTIVE DELIGHT) Ingredient Love",
                    "(EMOTIVE DELIGHT) Makes Life Easier!",
                    "Foresight",
                    "(FORESIGHT) Expressed Intent",
                    "(FORESIGHT) Enticing",
                    "(FORESIGHT) On the Go",
                    "(FORESIGHT-NICHE) Dietary Issues - Special Diets",
                    "(FORESIGHT-NICHE) Gift",
                    "(FORESIGHT-NICHE) Health Conditions",
                    "(FORESIGHT-NICHE) Holiday",
                    "(FORESIGHT-NICHE) Kids",
                    "(FORESIGHT-NICHE) Seasonal",
                    "(FORESIGHT-NICHE) Social Gatherings",
                    "(FORESIGHT-NICHE) Special Occasion - Event",
                    "(FORESIGHT-NICHE) Travel",
                    "New News",
                    "(NEW NEWS) Eye Catching",
                    "Surprise",
                    "Niche (Initial)",
                    "Negativity",
                    "(NEUTRALITY-NEGATIVITY) Too Much Work",
                    "Fixable",
                    "Skeptical",
                    "(SKEPTICAL) Hopeful Skepticism",
                    "(SKEPTICAL) Taste Skepticism",
                    "Unclear",
                    "Not For Me",
                    "(NOT FOR ME) Brand",
                    "(NOT FOR ME) Category",
                    "(NOT FOR ME) Flavor",
                    "(NOT FOR ME) Ingredient",
                    "(NOT FOR ME) Outright Rejection",
                    "Blah",
                    "(BLAH) Lacks Distinction (Me Too)",
                    "(BLAH) Old News",
                    "Pointless",
                    "(POINTLESS) Gimmick",
                    "(POINTLESS) No Need",
                    "Bust",
                    "(BUST) Bad Idea",
                    "(BUST) Emotive Disgust or Contempt",
                    "Overpriced",
                    "(OVERPRICED) Assumed Expensiveness",
                    "(OVERPRICED) Explicit Price Sensitivity",
                    "Neutrality",
                    "(NEUTRALITY-NEGATIVITY) Too Much Work",
                    "Nonsense",
                  ];

                  // Filter traits based on type
                  if (possibleTraits.length > 0) {
                  }

                  const filteredTraits = possibleTraits
                    .filter(t => {
                      const type = (selectedRowForFeedback.type || '').toLowerCase();
                      if (type.includes('initial')) return t.initialReactionEnabled;
                      if (type.includes('context')) return t.contextPromptEnabled;
                      return false;
                    });

                  // Sort traits according to the custom order
                  const sortedTraits = filteredTraits.sort((a, b) => {
                    const indexA = traitOrder.indexOf(a.title);
                    const indexB = traitOrder.indexOf(b.title);

                    // If trait not in order list, put it at the end
                    if (indexA === -1 && indexB === -1) return 0;
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;

                    return indexA - indexB;
                  });

                  return sortedTraits.map(t => ({ value: t.title, label: t.title }));
                })()}
                value={selectedTraitsFromList ? { value: selectedTraitsFromList, label: selectedTraitsFromList } : null}
                onChange={(selected) => {
                  setSelectedTraitsFromList(selected ? selected.value : null);
                }}
                placeholder="Search and select traits..."
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: '45px',
                    borderColor: '#ddd',
                    '&:hover': {
                      borderColor: '#007bff'
                    }
                  }),
                  multiValue: (base) => ({
                    ...base,
                    backgroundColor: '#007bff',
                  }),
                  multiValueLabel: (base) => ({
                    ...base,
                    color: 'white',
                    fontWeight: 'bold'
                  }),
                  multiValueRemove: (base) => ({
                    ...base,
                    color: 'white',
                    ':hover': {
                      backgroundColor: '#0056b3',
                      color: 'white',
                    },
                  }),
                }}
              />

              {selectedTraitsFromList && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
                  Selected: {selectedTraitsFromList}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Should Exist:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button
                  onClick={() => setShouldExist(1)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: shouldExist === 1 ? '#28a745' : '#e9ecef',
                    color: shouldExist === 1 ? 'white' : '#495057',
                    border: shouldExist === 1 ? '2px solid #28a745' : '2px solid #ced4da',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                >
                  True
                </button>
                <button
                  onClick={() => setShouldExist(0)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: shouldExist === 0 ? '#dc3545' : '#e9ecef',
                    color: shouldExist === 0 ? 'white' : '#495057',
                    border: shouldExist === 0 ? '2px solid #dc3545' : '2px solid #ced4da',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                >
                  False
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Feedback:
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Enter feedback for this trait..."
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                  fontSize: '14px',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setSelectedRowForFeedback(null);
                  setSelectedTraitsFromList(null);
                  setFeedbackText('');
                  setShouldExist(1);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!selectedTraitsFromList) {
                    alert('Please select a trait');
                    return;
                  }

                  setIsSubmittingFeedback(true);
                  try {
                    const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/feedback', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        traitName: selectedTraitsFromList,
                        feedback: feedbackText,
                        documentId: selectedRowForFeedback.id.split('_')[0],
                        genAiRecordId: null,
                        type: selectedRowForFeedback.type,
                        isTraitValidationIncorrect: shouldExist
                      })
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const result = await response.json();

                    // Row will be updated via WebSocket 'feedback_added' event
                    if (result.success) {
                      console.log('Feedback submitted successfully, waiting for WebSocket update...');
                    }

                    setSelectedRowForFeedback(null);
                    setFeedbackText('');
                    setSelectedTraitsFromList([]);
                    setShouldExist(true);
                  } catch (error) {
                    console.error('Error submitting feedback:', error);
                    alert(`Error: ${error.message}`);
                  } finally {
                    setIsSubmittingFeedback(false);
                  }
                }}
                disabled={isSubmittingFeedback}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSubmittingFeedback ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  opacity: isSubmittingFeedback ? 0.7 : 1
                }}
              >
                {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GenAITraitValidationForm;
