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
        const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits');
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
    concept_input: ''
  });

  const [formData, setFormData] = useState(getInitialFormState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiResponse, setApiResponse] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  const [tableError, setTableError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Trait feedback modal state
  const [selectedTraitFeedback, setSelectedTraitFeedback] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [selectedRowForFeedback, setSelectedRowForFeedback] = useState(null);
  const [selectedTraitsFromList, setSelectedTraitsFromList] = useState([]);
  const [shouldExist, setShouldExist] = useState(true);

  // WebSocket states
  const [wsConnected, setWsConnected] = useState(false);
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
    const requiredColumns = ['context_prompt', 'initial_reaction'];
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
        csv_data: csvData.map(row => ({
          context_prompt: row.context_prompt || '',
          initial_reaction: row.initial_reaction || '',
          uuid: row.uuid || ''
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
        version: formData.version
      };

      if (formData.version === 'context') {
        apiData.project_input = formData.project_input.trim();
        apiData.concept_input = formData.concept_input.trim();
      }
    }

    console.log('Submitting form', apiData);
    try {
      const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/process', {
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
          '2. The server has CORS enabled to accept requests from http://localhost:3000\n' +
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
      const genAiScore = record.genAiSays?.score || 0;
      traitMap.set(record.traitTitle, {
        llmScore,
        genAiScore
      });
    });

    // Identify changes
    const addedTraits = [];
    const removedTraits = [];
    const unchangedTraits = [];

    // Check all traits in genAiRecords
    traitMap.forEach((scores, traitName) => {
      if (scores.llmScore === 1 && scores.genAiScore === 1) {
        // Unchanged - was in original and GenAI confirmed
        unchangedTraits.push(traitName);
      } else if (scores.llmScore === 1 && scores.genAiScore === 0) {
        // Removed - was in original but GenAI says no
        removedTraits.push(traitName);
      } else if (scores.llmScore === 0 && scores.genAiScore === 1) {
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
    setSelectedRowForFeedback(row);
    setSelectedTraitFromList('');
    setFeedbackText('');
  };

  // Function to download data as CSV
  const handleDownloadCSV = () => {
    if (tableData.length === 0) {
      alert('No data to export');
      return;
    }

    // Prepare CSV data
    const csvRows = [];

    // CSV Headers
    const headers = [
      'Document ID',
      'Version',
      'Type',
      'Text',
      'Original Traits',
      'GenAI Made Changes',
      'Traits Added',
      'Added Traits Feedback',
      'Traits Removed',
      'Removed Traits Feedback',
      'Unchanged Traits',
      'Unchanged Traits Feedback',
      'Total Original',
      'Total Added',
      'Total Removed'
    ];
    csvRows.push(headers.join(','));

    // Helper: get feedback string from feedback array filtered by shouldExist
    function getFeedbackByShouldExist(feedbackArray, shouldExistValue) {
      if (!Array.isArray(feedbackArray)) return '';
      return feedbackArray
        .filter(fb => fb.shouldExist === shouldExistValue)
        .map(fb => {
          const feedbackText = fb.text ? fb.text.replace(/\"/g, '"') : '';
          return `${fb.trait} (feedback: ${feedbackText}, shouldExist: ${fb.shouldExist})`;
        })
        .join('; ');
    }

    // Helper: get feedback string for unchanged traits (no shouldExist or null)
    function getUnchangedFeedback(feedbackArray) {
      if (!Array.isArray(feedbackArray)) return '';
      return feedbackArray
        .filter(fb => fb.shouldExist === undefined || fb.shouldExist === null)
        .map(fb => {
          const feedbackText = fb.text ? fb.text.replace(/\"/g, '"') : '';
          return `${fb.trait} (feedback: ${feedbackText})`;
        })
        .join('; ');
    }

    // Process each document
    tableData.forEach((item) => {
      // Process Initial Reaction
      if (item.initial_reaction) {
        const analysis = analyzeTraits(item, 'initial_reaction');
        const feedbackArray = item.initial_reaction.feedback || [];
        if (analysis) {
          const addedFeedback = getFeedbackByShouldExist(feedbackArray, true);
          const removedFeedback = getFeedbackByShouldExist(feedbackArray, false);
          const unchangedFeedback = getUnchangedFeedback(feedbackArray);
          const row = [
            `"${item._id || ''}"`,
            `"${item.version || ''}"`,
            `"INITIAL_REACTION"`,
            `"${(item.initial_reaction.text || '').replace(/\"/g, '"')}"`,
            `"${analysis.originalTraits}"`,
            `"${analysis.hasChanges ? 'Yes' : 'No'}"`,
            `"${analysis.addedTraits}"`,
            `"${addedFeedback}"`,
            `"${analysis.removedTraits}"`,
            `"${removedFeedback}"`,
            `"${analysis.unchangedTraits}"`,
            `"${unchangedFeedback}"`,
            analysis.totalOriginal,
            analysis.totalAdded,
            analysis.totalRemoved
          ];
          csvRows.push(row.join(','));
        }
      }

      // Process Context Prompt
      if (item.context_prompt) {
        const analysis = analyzeTraits(item, 'context_prompt');
        const feedbackArray = item.context_prompt.feedback || [];
        if (analysis) {
          const addedFeedback = getFeedbackByShouldExist(feedbackArray, true);
          const removedFeedback = getFeedbackByShouldExist(feedbackArray, false);
          const unchangedFeedback = getUnchangedFeedback(feedbackArray);
          const row = [
            `"${item._id || ''}"`,
            `"${item.version || ''}"`,
            `"CONTEXT_PROMPT"`,
            `"${(item.context_prompt.text || '').replace(/\"/g, '"')}"`,
            `"${analysis.originalTraits}"`,
            `"${analysis.hasChanges ? 'Yes' : 'No'}"`,
            `"${analysis.addedTraits}"`,
            `"${addedFeedback}"`,
            `"${analysis.removedTraits}"`,
            `"${removedFeedback}"`,
            `"${analysis.unchangedTraits}"`,
            `"${unchangedFeedback}"`,
            analysis.totalOriginal,
            analysis.totalAdded,
            analysis.totalRemoved
          ];
          csvRows.push(row.join(','));
        }
      }
    });

    // Create CSV content
    const csvContent = csvRows.join('\n');

    // Create blob and download
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `traits_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Are you sure you want to delete all data from Traits Database? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    setTableError(null);

    try {
      const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db', {
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
      alert('All data deleted successfully!');
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
        const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/db');
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
    const isGreen = genAiRecord.llmScore === 0 && genAiRecord.genAiSays?.score === 1;

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
      const genAiScore = record.genAiSays?.score || 0;

      let icon = '';
      let color = '';
      let displayName = record.traitTitle;

      if (llmScore === 1 && genAiScore === 1) {
        // Black checkbox icon, black font
        icon = '✓';
        color = 'black';
      } else if (llmScore === 1 && genAiScore === 0) {
        // Red X Icon, Red font for trait name in parentheses
        icon = '✗';
        color = 'red';
        displayName = `(${record.traitTitle})`;
      } else if (llmScore === 0 && genAiScore === 1) {
        // Green Plus Sign Icon, Green Font
        icon = '+';
        color = 'green';
      } else {
        // llmScore 0, genAiScore 0 - not listed
        return null;
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
        genAiScore: genAiScore,
        action: record.action || 'No change',
        finalScore: record.finalScore || 0,
        feedback: record.feedback || record.genAiSays?.feedback || ''
      };
    }).filter(trait => trait !== null);
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
    const tableRows = [];
    if (dataArray && dataArray.length > 0) {
      dataArray.forEach((item, idx) => {
        console.log(`Processing item ${idx}:`, item);
        console.log('Item has initial_reaction:', !!item.initial_reaction);
        console.log('Item has context_prompt:', !!item.context_prompt);

        // Add Initial Reaction row
        if (item.initial_reaction) {
          console.log('Initial Reaction genAiRecords:', item.initial_reaction.genAiRecords);
          const processedTraits = processTraits(item.initial_reaction.genAiRecords);
          console.log('Processed Initial Reaction Traits:', processedTraits);
          tableRows.push({
            id: `${item._id || idx}_initial`,
            version: item.version || '',
            type: item.initial_reaction.type || 'INITIAL_REACTION',
            text: item.initial_reaction.text || '',
            traits: processedTraits
          });
        }

        // Add Context Prompt row
        if (item.context_prompt) {
          console.log('Context Prompt genAiRecords:', item.context_prompt.genAiRecords);
          const processedTraits = processTraits(item.context_prompt.genAiRecords);
          console.log('Processed Context Prompt Traits:', processedTraits);
          tableRows.push({
            id: `${item._id || idx}_context`,
            version: item.version || '',
            type: item.context_prompt.type || 'CONTEXT_PROMPT',
            text: item.context_prompt.text || '',
            traits: processedTraits
          });
        }
      });
    } else {
      console.log('No dataArray or dataArray is empty');
    }

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
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <strong style={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#333', minWidth: '120px' }}>Initial Reaction:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {possibleTraits.filter(t => t.initialReactionEnabled).map((t, i) => (
                <span key={`ir_${i}`} style={{
                  background: '#f4f8fa',
                  border: '1px solid #ececec',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontSize: '12px',
                  color: '#444'
                }}>
                  {t.title}
                </span>
              ))}
            </div>
          </div>

          {/* Context Prompt Traits */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <strong style={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#333', minWidth: '120px' }}>Context Prompt:</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {possibleTraits.filter(t => t.contextPromptEnabled).map((t, i) => (
                <span key={`cp_${i}`} style={{
                  background: '#f4f8fa',
                  border: '1px solid #ececec',
                  borderRadius: 5,
                  padding: '2px 8px',
                  fontSize: '12px',
                  color: '#444'
                }}>
                  {t.title}
                </span>
              ))}
            </div>
          </div>
        </div>
        <table className="traits-table" style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: 0,
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          background: '#fff'
        }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            <tr>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)'
              }}>Version</th>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)',
                width: '60px'
              }}>No</th>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)'
              }}>Type</th>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)',
                minWidth: '600px'
              }}>Text</th>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)'
              }}>Hunch LLM Trait Assignments</th>
              <th style={{
                color: '#fff',
                fontWeight: '600',
                padding: '16px 12px',
                textAlign: 'left',
                fontSize: '13px',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                borderBottom: '2px solid rgba(255,255,255,0.2)'
              }}>GenAI Validation</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr
                key={row.id}
                onClick={() => handleRowClick(row)}
                style={{
                  cursor: 'pointer',
                  animation: `fadeInUp 0.5s ease-out ${rowIndex * 0.05}s both`,
                  transition: 'all 0.3s ease',
                  background: rowIndex % 2 === 0 ? '#fff' : '#f8f9ff'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(90deg, #f0f4ff 0%, #e8f0ff 100%)';
                  e.currentTarget.style.transform = 'scale(1.01)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = rowIndex % 2 === 0 ? '#fff' : '#f8f9ff';
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <td style={{
                  padding: '14px 12px',
                  borderBottom: '1px solid #e8ecf1',
                  fontSize: '14px',
                  color: '#495057',
                  fontWeight: '500'
                }}>{row.version}</td>
                <td style={{
                  padding: '14px 12px',
                  borderBottom: '1px solid #e8ecf1',
                  fontSize: '14px',
                  color: '#495057',
                  fontWeight: '600',
                  textAlign: 'center',
                  width: '60px'
                }}>{rowIndex + 1}</td>
                <td style={{
                  padding: '14px 12px',
                  borderBottom: '1px solid #e8ecf1',
                  fontSize: '14px',
                  color: '#495057'
                }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: row.type === 'INITIAL_REACTION' || row.type === 'initial_reaction'
                      ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                      : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    color: '#fff',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {row.type}
                  </span>
                </td>
                <td style={{
                  padding: '14px 12px',
                  borderBottom: '1px solid #e8ecf1',
                  fontSize: '14px',
                  color: '#495057',
                  minWidth: '600px',
                  lineHeight: '1.5'
                }}>{row.text}</td>

                <td className="traits-cell">
                  <div className="traits-list-inline">
                    {row.traits && row.traits.filter(t => t.llmScore === 1).length > 0 ? (
                      row.traits.filter(t => t.llmScore === 1).map((trait, index) => (
                        <div key={index} className="trait-indicator-wrapper" style={{
                          display: 'inline-block',
                          marginRight: '8px',
                          marginBottom: '6px',
                          animation: `fadeInScale 0.4s ease-out ${index * 0.05}s both`
                        }}>
                          <span
                            style={{
                              color: '#495057',
                              fontWeight: '500',
                              display: 'inline-block',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: '1px solid #e0e6ed',
                              background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                              position: 'relative',
                              transition: 'all 0.3s ease',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                              cursor: 'default'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                              e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
                              e.currentTarget.style.background = 'linear-gradient(135deg, #fff 0%, #f0f2f5 100%)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0) scale(1)';
                              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                              e.currentTarget.style.background = 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)';
                            }}
                            title={trait.rationale || trait.name}
                          >
                            <span className="trait-name">{trait.name}</span>
                            {/* Black dot if feedback exists */}
                            {trait.feedback && trait.feedback.trim() !== '' && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginLeft: '5px',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: '#111',
                                  verticalAlign: 'middle'
                                }}
                                title="Feedback added"
                              />
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>-</span>
                    )}
                  </div>
                </td>
                <td className="traits-cell">
                  <div className="traits-list-inline">
                    {row.traits && row.traits.filter(t => t.genAiScore === 1 || (t.llmScore === 1 && t.genAiScore === 0)).length > 0 ? (
                      row.traits.filter(t => t.genAiScore === 1 || (t.llmScore === 1 && t.genAiScore === 0)).map((trait, index) => (
                        <div key={index} className="trait-indicator-wrapper" style={{
                          display: 'inline-block',
                          marginRight: '8px',
                          marginBottom: '6px',
                          animation: `fadeInScale 0.4s ease-out ${index * 0.05}s both`
                        }}>
                          <span
                            style={{
                              color: trait.color,
                              fontWeight: '600',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: `2px solid ${trait.color}`,
                              background: trait.color === 'black'
                                ? 'linear-gradient(135deg, #f5f5f5 0%, #e9ecef 100%)'
                                : trait.color === 'red'
                                  ? 'linear-gradient(135deg, #ffe6e6 0%, #ffd6d6 100%)'
                                  : 'linear-gradient(135deg, #e6ffe6 0%, #d4f4d4 100%)',
                              position: 'relative',
                              transition: 'all 0.3s ease',
                              boxShadow: `0 2px 6px ${trait.color === 'black' ? 'rgba(0,0,0,0.1)' : trait.color === 'red' ? 'rgba(255,0,0,0.15)' : 'rgba(0,255,0,0.15)'}`,
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-3px) scale(1.08)';
                              e.currentTarget.style.boxShadow = `0 6px 12px ${trait.color === 'black' ? 'rgba(0,0,0,0.2)' : trait.color === 'red' ? 'rgba(255,0,0,0.25)' : 'rgba(0,255,0,0.25)'}`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0) scale(1)';
                              e.currentTarget.style.boxShadow = `0 2px 6px ${trait.color === 'black' ? 'rgba(0,0,0,0.1)' : trait.color === 'red' ? 'rgba(255,0,0,0.15)' : 'rgba(0,255,0,0.15)'}`;
                            }}
                            title={`Rationale: ${trait.rationale || 'N/A'}\nConfidence: ${(trait.confidence || 0).toFixed(2)}`}
                          >
                            <span style={{ fontSize: '14px' }}>{trait.icon}</span>
                            <span className="trait-name">{trait.displayName}</span>
                            {/* Black dot if feedback exists */}
                            {trait.feedback && trait.feedback.trim() !== '' && (
                              <span
                                style={{
                                  display: 'inline-block',
                                  marginLeft: '5px',
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  backgroundColor: '#111',
                                  verticalAlign: 'middle'
                                }}
                                title="Feedback added"
                              />
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>-</span>
                    )}
                  </div>
                </td>
                {/* New Possible Traits column */}
                <td className="possible-traits-cell">
                  <div style={{ fontSize: '13px', color: '#444', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {row.type === 'INITIAL_REACTION' || row.type === 'initial_reaction'
                      ? possibleTraits.filter(t => t.initialReactionEnabled).map((t, i) => <span key={t.title + '_' + i} style={{ background: '#f4f8fa', border: '1px solid #ececec', borderRadius: 5, padding: '2px 8px', marginRight: 5 }}>{t.title}</span>)
                      : row.type === 'CONTEXT_PROMPT' || row.type === 'context_prompt'
                        ? possibleTraits.filter(t => t.contextPromptEnabled).map((t, i) => <span key={t.title + '_' + i} style={{ background: '#f4f8fa', border: '1px solid #ececec', borderRadius: 5, padding: '2px 8px', marginRight: 5 }}>{t.title}</span>)
                        : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <div className="form-container">
        <h1>GenAI Trait Validation Form</h1>
        <form onSubmit={handleSubmit} onReset={handleReset}>
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
        <div className="table-container-inner">
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
          {isLoadingTable && <p className="loading-text">Loading data...</p>}
          {tableError && (
            <div className="error-box">
              <p><strong>Error:</strong> {tableError}</p>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length > 0 && (
            <div className="table-wrapper">
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
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <strong style={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#333', minWidth: '120px' }}>Initial Reaction:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {possibleTraits.filter(t => t.initialReactionEnabled).map((t, i) => (
                      <span key={`ir_${i}`} style={{
                        background: '#f4f8fa',
                        border: '1px solid #ececec',
                        borderRadius: 5,
                        padding: '2px 8px',
                        fontSize: '12px',
                        color: '#444'
                      }}>
                        {t.title}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Context Prompt Traits */}
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <strong style={{ whiteSpace: 'nowrap', fontSize: '14px', color: '#333', minWidth: '120px' }}>Context Prompt:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {possibleTraits.filter(t => t.contextPromptEnabled).map((t, i) => (
                      <span key={`cp_${i}`} style={{
                        background: '#f4f8fa',
                        border: '1px solid #ececec',
                        borderRadius: 5,
                        padding: '2px 8px',
                        fontSize: '12px',
                        color: '#444'
                      }}>
                        {t.title}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <table className="traits-table" style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: 0,
                borderRadius: '12px',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                background: '#fff'
              }}>
                <thead style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                  <tr>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)',
                      width: '60px'
                    }}>No</th>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)'
                    }}>Version</th>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)'
                    }}>Type</th>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)',
                      minWidth: '600px'
                    }}>Text</th>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)'
                    }}>Hunch LLM Trait Assignments</th>
                    <th style={{
                      color: '#fff',
                      fontWeight: '600',
                      padding: '16px 12px',
                      textAlign: 'left',
                      fontSize: '13px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      borderBottom: '2px solid rgba(255,255,255,0.2)'
                    }}>GenAI Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Flatten tableData to show initial_reaction and context_prompt as separate rows
                    const flattenedRows = [];
                    tableData.forEach((item) => {
                      // Add Initial Reaction row
                      if (item.initial_reaction) {
                        const processedTraits = processTraits(item.initial_reaction.genAiRecords);
                        flattenedRows.push({
                          id: `${item._id}_initial`,
                          version: item.version || '',
                          type: item.initial_reaction.type || 'INITIAL_REACTION',
                          text: item.initial_reaction.text || '',
                          traits: processedTraits
                        });
                      }
                      // Add Context Prompt row
                      if (item.context_prompt) {
                        const processedTraits = processTraits(item.context_prompt.genAiRecords);
                        flattenedRows.push({
                          id: `${item._id}_context`,
                          version: item.version || '',
                          type: item.context_prompt.type || 'CONTEXT_PROMPT',
                          text: item.context_prompt.text || '',
                          traits: processedTraits
                        });
                      }
                    });

                    return flattenedRows.map((row, rowIndex) => (
                      <tr
                        key={row.id}
                        onClick={() => handleRowClick(row)}
                        style={{
                          cursor: 'pointer',
                          animation: `fadeInUp 0.5s ease-out ${rowIndex * 0.05}s both`,
                          transition: 'all 0.3s ease',
                          background: rowIndex % 2 === 0 ? '#fff' : '#f8f9ff'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(90deg, #f0f4ff 0%, #e8f0ff 100%)';
                          e.currentTarget.style.transform = 'scale(1.01)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = rowIndex % 2 === 0 ? '#fff' : '#f8f9ff';
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057',
                          fontWeight: '600',
                          textAlign: 'center',
                          width: '60px'
                        }}>{rowIndex + 1}</td>
                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057',
                          fontWeight: '500'
                        }}>{row.version}</td>
                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057'
                        }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: row.type === 'INITIAL_REACTION' || row.type === 'initial_reaction'
                              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                              : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                            color: '#fff',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            {row.type}
                          </span>
                        </td>
                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057',
                          minWidth: '600px',
                          lineHeight: '1.5'
                        }}>{row.text}</td>

                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057'
                        }}>
                          <div className="traits-list-inline">
                            {row.traits && row.traits.filter(t => t.llmScore === 1).length > 0 ? (
                              row.traits.filter(t => t.llmScore === 1).map((trait, index) => (
                                <div key={index} className="trait-indicator-wrapper" style={{
                                  display: 'inline-block',
                                  marginRight: '8px',
                                  marginBottom: '6px',
                                  animation: `fadeInScale 0.4s ease-out ${index * 0.05}s both`
                                }}>
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTraitFeedback({
                                        ...trait,
                                        documentId: row.id.split('_')[0],
                                        type: row.type
                                      });
                                      setFeedbackText(trait.feedback || '');
                                    }}
                                    style={{
                                      color: '#495057',
                                      fontWeight: '500',
                                      display: 'inline-block',
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      border: '1px solid #e0e6ed',
                                      background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                                      position: 'relative',
                                      transition: 'all 0.3s ease',
                                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                      cursor: 'pointer',
                                      userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.12)';
                                      e.currentTarget.style.background = 'linear-gradient(135deg, #fff 0%, #f0f2f5 100%)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                                      e.currentTarget.style.background = 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)';
                                    }}
                                    title={trait.rationale || trait.name}
                                  >
                                    <span className="trait-name">{trait.name}</span>
                                    {/* Black dot if feedback exists */}
                                    {trait.feedback && trait.feedback.trim() !== '' && (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          marginLeft: '5px',
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: '#111',
                                          verticalAlign: 'middle'
                                        }}
                                        title="Feedback added"
                                      />
                                    )}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span style={{ color: '#999', fontStyle: 'italic' }}>-</span>
                            )}
                          </div>
                        </td>
                        <td style={{
                          padding: '14px 12px',
                          borderBottom: '1px solid #e8ecf1',
                          fontSize: '14px',
                          color: '#495057'
                        }}>
                          <div className="traits-list-inline">
                            {row.traits && row.traits.filter(t => t.genAiScore === 1 || (t.llmScore === 1 && t.genAiScore === 0)).length > 0 ? (
                              row.traits.filter(t => t.genAiScore === 1 || (t.llmScore === 1 && t.genAiScore === 0)).map((trait, index) => (
                                <div key={index} className="trait-indicator-wrapper" style={{
                                  display: 'inline-block',
                                  marginRight: '8px',
                                  marginBottom: '6px',
                                  animation: `fadeInScale 0.4s ease-out ${index * 0.05}s both`
                                }}>
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTraitFeedback({
                                        ...trait,
                                        documentId: row.id.split('_')[0],
                                        type: row.type
                                      });
                                      setFeedbackText(trait.feedback || '');
                                    }}
                                    style={{
                                      color: trait.color,
                                      fontWeight: '600',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      border: `2px solid ${trait.color}`,
                                      background: trait.color === 'black'
                                        ? 'linear-gradient(135deg, #f5f5f5 0%, #e9ecef 100%)'
                                        : trait.color === 'red'
                                          ? 'linear-gradient(135deg, #ffe6e6 0%, #ffd6d6 100%)'
                                          : 'linear-gradient(135deg, #e6ffe6 0%, #d4f4d4 100%)',
                                      position: 'relative',
                                      transition: 'all 0.3s ease',
                                      boxShadow: `0 2px 6px ${trait.color === 'black' ? 'rgba(0,0,0,0.1)' : trait.color === 'red' ? 'rgba(255,0,0,0.15)' : 'rgba(0,255,0,0.15)'}`,
                                      cursor: 'pointer',
                                      userSelect: 'none'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = 'translateY(-3px) scale(1.08)';
                                      e.currentTarget.style.boxShadow = `0 6px 12px ${trait.color === 'black' ? 'rgba(0,0,0,0.2)' : trait.color === 'red' ? 'rgba(255,0,0,0.25)' : 'rgba(0,255,0,0.25)'}`;
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                      e.currentTarget.style.boxShadow = `0 2px 6px ${trait.color === 'black' ? 'rgba(0,0,0,0.1)' : trait.color === 'red' ? 'rgba(255,0,0,0.15)' : 'rgba(0,255,0,0.15)'}`;
                                    }}
                                    title={`Rationale: ${trait.rationale || 'N/A'}\nConfidence: ${(trait.confidence || 0).toFixed(2)}`}
                                  >
                                    <span style={{ fontSize: '14px' }}>{trait.icon}</span>
                                    <span className="trait-name">{trait.displayName}</span>
                                    {/* Black dot if feedback exists */}
                                    {trait.feedback && trait.feedback.trim() !== '' && (
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          marginLeft: '5px',
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          backgroundColor: '#111',
                                          verticalAlign: 'middle'
                                        }}
                                        title="Feedback added"
                                      />
                                    )}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span style={{ color: '#999', fontStyle: 'italic' }}>-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
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
          onClick={() => setSelectedTraitFeedback(null)}
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
                onClick={() => setSelectedTraitFeedback(null)}
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
              <strong style={{ color: '#666' }}>Status:</strong>
              <div style={{ marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  backgroundColor: selectedTraitFeedback.color === 'black' ? '#f5f5f5' :
                    selectedTraitFeedback.color === 'red' ? '#ffe6e6' : '#e6ffe6',
                  color: selectedTraitFeedback.color,
                  fontWeight: 'bold'
                }}>
                  {selectedTraitFeedback.llmScore === 1 && selectedTraitFeedback.genAiScore === 1 && '✓ Confirmed'}
                  {selectedTraitFeedback.llmScore === 1 && selectedTraitFeedback.genAiScore === 0 && '✗ Removed'}
                  {selectedTraitFeedback.llmScore === 0 && selectedTraitFeedback.genAiScore === 1 && '+ Added'}
                </span>
                <span style={{ color: '#666', fontSize: '14px' }}>
                  (Hunch LLM: {selectedTraitFeedback.llmScore === 1 ? 'Yes' : 'No'},
                  GenAI: {selectedTraitFeedback.genAiScore === 1 ? 'Yes' : 'No'})
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666' }}>Action:</strong>
              <p style={{ margin: '5px 0 0 0', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                {selectedTraitFeedback.action || 'No change'}
              </p>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666' }}>Confidence:</strong>
              <div style={{ marginTop: '5px' }}>
                <div style={{
                  width: '100%',
                  height: '20px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '10px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${(selectedTraitFeedback.confidence || 0) * 100}%`,
                    height: '100%',
                    backgroundColor: selectedTraitFeedback.confidence >= 0.8 ? '#28a745' :
                      selectedTraitFeedback.confidence >= 0.6 ? '#ffc107' : '#dc3545',
                    transition: 'width 0.3s'
                  }}></div>
                </div>
                <span style={{ fontSize: '14px', color: '#666', marginTop: '5px', display: 'block' }}>
                  {(selectedTraitFeedback.confidence || 0).toFixed(2)} ({(selectedTraitFeedback.confidence || 0) * 100}%)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <strong style={{ color: '#666' }}>GenAI Present:</strong>
              <p style={{ margin: '5px 0 0 0', padding: '8px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                {selectedTraitFeedback.present ? 'Yes' : 'No'}
              </p>
            </div>

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

            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setSelectedTraitFeedback(null);
                  setFeedbackText('');
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
                    const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/feedback', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        traitName: selectedTraitFeedback.name,
                        feedback: feedbackText,
                        documentId: selectedTraitFeedback.documentId,
                        type: selectedTraitFeedback.type
                      })
                    });

                    if (!response.ok) {
                      throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const result = await response.json();
                    alert('Feedback submitted successfully!');
                    setSelectedTraitFeedback(null);
                    setFeedbackText('');
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
                {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              <h2 style={{ margin: 0 }}>Add Trait Feedback</h2>
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
                {selectedRowForFeedback.text}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Select Traits (Multiple):
              </label>
              
              <Select
                isMulti
                options={possibleTraits
                  .filter(t => {
                    const type = selectedRowForFeedback.type.toLowerCase();
                    if (type.includes('initial')) return t.initialReactionEnabled;
                    if (type.includes('context')) return t.contextPromptEnabled;
                    return false;
                  })
                  .map(t => ({ value: t.title, label: t.title }))
                }
                value={selectedTraitsFromList.map(trait => ({ value: trait, label: trait }))}
                onChange={(selected) => {
                  setSelectedTraitsFromList(selected ? selected.map(option => option.value) : []);
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
              
              {selectedTraitsFromList.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '13px', color: '#666' }}>
                  Selected: {selectedTraitsFromList.length} trait(s)
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#333' }}>
                Should Exist:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button
                  onClick={() => setShouldExist(true)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: shouldExist ? '#28a745' : '#e9ecef',
                    color: shouldExist ? 'white' : '#495057',
                    border: shouldExist ? '2px solid #28a745' : '2px solid #ced4da',
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
                  onClick={() => setShouldExist(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: !shouldExist ? '#dc3545' : '#e9ecef',
                    color: !shouldExist ? 'white' : '#495057',
                    border: !shouldExist ? '2px solid #dc3545' : '2px solid #ced4da',
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
                  setSelectedTraitsFromList([]);
                  setFeedbackText('');
                  setShouldExist(true);
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
                  if (selectedTraitsFromList.length === 0) {
                    alert('Please select at least one trait');
                    return;
                  }

                  setIsSubmittingFeedback(true);
                  try {
                    // Create array of objects for each selected trait
                    const feedbackArray = selectedTraitsFromList.map(traitName => ({
                      traitName: traitName,
                      feedback: feedbackText,
                      documentId: selectedRowForFeedback.id.split('_')[0],
                      type: selectedRowForFeedback.type,
                      shouldExist: shouldExist
                    }));

                    const response = await fetch('https://hunchgenaitest-320866101884.us-central1.run.app/api/traits/store-feedback', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        feedbackArray: feedbackArray
                      })
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const result = await response.json();
                    alert('Feedback submitted successfully!');
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
