import React, { useState, useEffect, useRef, useCallback } from 'react';
import './GenAITraitValidationForm.css';

const GenAITraitValidationForm = () => {
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
        present: record.genAiSays?.present || false
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
        <table className="traits-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Type</th>
              <th>Text</th>
              <th>Traits</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.id}>
                <td className="type-cell">{row.version}</td>
                <td className="type-cell">{row.type}</td>
                <td className="text-cell">{row.text}</td>
                <td className="traits-cell">
                  <div className="traits-list-inline">
                    {row.traits && row.traits.length > 0 ? (
                      row.traits.map((trait, index) => (
                        <div key={index} className="trait-indicator-wrapper" style={{ display: 'inline-block', marginRight: '10px', marginBottom: '5px' }}>
                          <span
                            style={{
                              color: trait.color,
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: `1px solid ${trait.color}`,
                              backgroundColor: trait.color === 'black' ? '#f5f5f5' : trait.color === 'red' ? '#ffe6e6' : '#e6ffe6'
                            }}
                            title={trait.rationale || trait.name}
                          >
                            <span style={{ fontSize: '14px' }}>{trait.icon}</span>
                            <span className="trait-name">{trait.displayName}</span>
                          </span>
                        </div>
                      ))
                    ) : (
                      <span style={{ color: '#999', fontStyle: 'italic' }}>No traits</span>
                    )}
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
                  <thead>
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

        {apiResponse && (
          <div className="response-container">
            <h2>Response</h2>
            {renderResponseTable()}
          </div>
        )}
      </div>

      {/* ... existing table-container section remains the same ... */}
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
          {isLoadingTable && <p className="loading-text">Loading data...</p>}
          {tableError && (
            <div className="error-box">
              <p><strong>Error:</strong> {tableError}</p>
            </div>
          )}
          {!isLoadingTable && !tableError && tableData.length > 0 && (
            <div className="table-wrapper">
              <table className="traits-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Type</th>
                    <th>Text</th>
                    <th>Traits</th>
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
                    
                    return flattenedRows.map((row) => (
                      <tr key={row.id}>
                        <td className="type-cell">{row.version}</td>
                        <td className="type-cell">{row.type}</td>
                        <td className="text-cell">{row.text}</td>
                        <td className="traits-cell">
                          <div className="traits-list-inline">
                            {row.traits && row.traits.length > 0 ? (
                              row.traits.map((trait, index) => (
                                <div key={index} className="trait-indicator-wrapper" style={{ display: 'inline-block', marginRight: '10px', marginBottom: '5px' }}>
                                  <span
                                    style={{
                                      color: trait.color,
                                      fontWeight: 'bold',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      padding: '4px 8px',
                                      borderRadius: '4px',
                                      border: `1px solid ${trait.color}`,
                                      backgroundColor: trait.color === 'black' ? '#f5f5f5' : trait.color === 'red' ? '#ffe6e6' : '#e6ffe6'
                                    }}
                                    title={trait.rationale || trait.name}
                                  >
                                    <span style={{ fontSize: '14px' }}>{trait.icon}</span>
                                    <span className="trait-name">{trait.displayName}</span>
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span style={{ color: '#999', fontStyle: 'italic' }}>No traits</span>
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
    </>
  );
};

export default GenAITraitValidationForm;
