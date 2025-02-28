# Document Comparison Tool

## Overview

The Document Comparison Tool is a web application that allows users to upload, compare, and analyze text and PDF documents. It utilizes advanced algorithms to detect similarities between documents, providing users with insights into their content. The application features a user-friendly interface and a credit-based system for managing document comparisons.

## Features

- Upload and manage text and PDF documents.
- Compare documents to detect similarities using advanced algorithms.
- Real-time similarity scoring with detailed results.
- User-friendly dashboard for easy navigation.
- Credit-based system for document comparisons.

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Database**: JSON files for user and document storage
- **PDF Processing**: PDF.js for extracting text from PDF files

## Installation

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)

### Steps to Install

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/document-comparison-tool.git
   cd document-comparison-tool
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to `http://localhost:3000` to access the application.

## Usage

1. **Login**: Use your email and password to log in. If you don't have an account, you can create one.
2. **Upload Documents**: Navigate to the upload section to upload text or PDF documents. Each upload costs 1 credit.
3. **Compare Documents**: Use the comparison feature to analyze similarities between your uploaded documents. You can compare text directly or upload a PDF for comparison.
4. **View Results**: After comparison, view the results displayed in a user-friendly format, including similarity percentages and document details.

## Images

Here are some sample images related to the project:

![Sample Image 1](public/assets/sample1.jpg)
![Sample Image 2](public/assets/sample2.jpg)

## API Endpoints

- **POST /api/login**: Authenticate users and return a token.
- **POST /api/upload**: Upload a document (text or PDF).
- **POST /api/compare**: Compare text against uploaded documents.
- **POST /api/compare/pdfs**: Compare multiple PDF documents.

## Contributing

Contributions are welcome! If you have suggestions for improvements or new features, please open an issue or submit a pull request.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [PDF.js](https://mozilla.github.io/pdf.js/) for PDF text extraction.
- [Express](https://expressjs.com/) for the backend framework.
- [Node.js](https://nodejs.org/) for the server-side environment.

## Contact

For any inquiries or feedback, please contact [your-email@example.com].