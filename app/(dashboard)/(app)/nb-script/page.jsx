"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import Card from "@/components/ui/Card";
import { Icon } from "@iconify/react";
import { Disclosure, Transition } from "@headlessui/react";
import { toast, ToastContainer } from "react-toastify";
import SimpleBar from "simplebar-react";

const DbDataPage = () => {
  const [foldersData, setFoldersData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showPassword, setShowPassword] = useState({});
  const [activeTab, setActiveTab] = useState("list"); // "list" or "submit"
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    website: "",
    description: ""
  });

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Date(dateString).toLocaleDateString("id-ID", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const fetchDbData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/general/nb-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: "folder" }),
      });

      if (!response.ok) {
        let errorBody = "Unknown error";
        try {
          errorBody = await response.text();
        } catch (e) {}
        throw new Error(`HTTP error ${response.status}: ${response.statusText}. ${errorBody.substring(0,100)}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("Data format is not an array as expected.");
      }
      setFoldersData(data);
    } catch (err) {
      console.error("Failed to fetch DBData:", err);
      setError(err.message);
      toast.error(`Error loading data: ${err.message.substring(0, 100)}...`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    
    // Validasi form
    if (!formData.name || !formData.email || !formData.website || !formData.description) {
      toast.error("Semua field harus diisi!");
      return;
    }

    // Validasi email sederhana
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Format email tidak valid!");
      return;
    }

    // Validasi URL sederhana
    const urlRegex = /^https?:\/\/.+\..+/;
    if (!urlRegex.test(formData.website)) {
      toast.error("Format website tidak valid! Harus dimulai dengan http:// atau https://");
      return;
    }

    setSubmitLoading(true);
    try {
      const response = await fetch('/api/general/nb-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: "submit",
          ...formData
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error ${response.status}`);
      }

      toast.success("Request berhasil dikirim!");
      setFormData({
        name: "",
        email: "",
        website: "",
        description: ""
      });
    } catch (err) {
      console.error("Failed to submit request:", err);
      toast.error(`Error submitting request: ${err.message}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  useEffect(() => {
    fetchDbData();
  }, []);

  const filteredFolders = useMemo(() => {
    if (!searchTerm) return foldersData;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return foldersData.map(folder => {
      const filteredContents = folder.contents?.filter(content =>
        content.title?.toLowerCase().includes(lowerSearchTerm) ||
        content.description?.toLowerCase().includes(lowerSearchTerm) ||
        content.author?.toLowerCase().includes(lowerSearchTerm)
      );
      if (folder.name?.toLowerCase().includes(lowerSearchTerm) || filteredContents?.length > 0) {
        return { ...folder, contents: (folder.name?.toLowerCase().includes(lowerSearchTerm) && filteredContents?.length === 0) ? folder.contents : (filteredContents || []) };
      }
      return null;
    }).filter(folder => folder !== null);
  }, [searchTerm, foldersData]);

  const toggleShowPassword = (folderId, contentIndex) => {
    const key = `${folderId}-${contentIndex}`;
    setShowPassword(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="w-full px-2 sm:px-4 md:px-6 py-6">
      <ToastContainer
        position="top-right"
        autoClose={3500}
        newestOnTop
        theme="colored"
        toastClassName={(options) =>
          `relative flex p-1 min-h-10 rounded-md justify-between overflow-hidden cursor-pointer
          ${options?.type === 'success' ? 'bg-emerald-500 text-white' :
          options?.type === 'error' ? 'bg-red-500 text-white' :
          'bg-teal-500 text-white'} dark:text-slate-100 text-sm p-3 m-2 rounded-lg shadow-md`
        }
      />
      <Card
        bodyClass="relative p-0 h-full overflow-hidden"
        className="w-full border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white text-slate-800 dark:bg-slate-800/50 dark:text-slate-100 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80"
      >
        {/* Header Section */}
        <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
          <div className="flex flex-col sm:flex-row items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md mb-2 sm:mb-0">
              <Icon icon="ph:database-duotone" className="text-2xl sm:text-3xl" />
            </div>
            <h1 className="ml-0 sm:ml-4 text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500 text-center sm:text-left">
              NBScript Manager
            </h1>
          </div>
          <p className="text-sm text-center sm:text-left text-slate-500 dark:text-slate-400 mt-2 ml-0 sm:ml-[calc(2.5rem+1rem)] md:ml-[calc(3rem+1rem)]">
            Kelola folder dan submit request ke NBScript.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-700/60">
          <div className="flex">
            <button
              onClick={() => setActiveTab("list")}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors duration-150 ${
                activeTab === "list"
                  ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-b-2 border-teal-500"
                  : "text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
              }`}
            >
              <Icon icon="ph:list-duotone" className="inline mr-2" />
              List Folder
            </button>
            <button
              onClick={() => setActiveTab("submit")}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors duration-150 ${
                activeTab === "submit"
                  ? "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border-b-2 border-teal-500"
                  : "text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
              }`}
            >
              <Icon icon="ph:paper-plane-duotone" className="inline mr-2" />
              Submit Request
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === "list" && (
          <>
            {/* Search Bar */}
            <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon icon="ph:magnifying-glass-duotone" className="text-slate-400 dark:text-slate-500" />
                </div>
                <input
                  type="text"
                  placeholder="Cari folder atau konten..."
                  className="w-full pl-10 pr-3 py-2 text-sm bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-200 rounded-md shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Folder List Content */}
            {loading && (
              <div className="flex flex-col items-center justify-center p-10 min-h-[300px] sm:min-h-[400px]">
                <Icon icon="svg-spinners:blocks-shuffle-3" className="text-5xl text-emerald-500 mb-4" />
                <p className="text-lg sm:text-xl font-medium text-slate-600 dark:text-slate-300">Memuat Data dari NBScript...</p>
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center justify-center p-6 sm:p-10 min-h-[300px] sm:min-h-[400px] bg-red-50 dark:bg-red-900/20 rounded-b-xl">
                <Icon icon="ph:wifi-slash-duotone" className="text-5xl sm:text-6xl text-red-500 mb-4" />
                <p className="text-lg sm:text-xl font-semibold text-red-700 dark:text-red-300">Gagal Memuat Data</p>
                <p className="text-sm sm:text-base text-red-600 dark:text-red-400 mt-1 max-w-md text-center">{error}</p>
                <button
                  onClick={fetchDbData}
                  className="mt-4 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-md transition-colors"
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {!loading && !error && foldersData.length > 0 && filteredFolders.length === 0 && searchTerm && (
              <div className="p-6 sm:p-10 text-center text-slate-500 dark:text-slate-400 min-h-[200px] sm:min-h-[300px] flex flex-col justify-center items-center">
                <Icon icon="ph:magnifying-glass-minus-duotone" className="text-5xl sm:text-6xl mb-3 opacity-70"/>
                <p className="text-lg sm:text-xl">Tidak ada hasil untuk "{searchTerm}".</p>
                <p className="text-sm sm:text-base">Coba kata kunci pencarian lain.</p>
              </div>
            )}

            {!loading && !error && foldersData.length === 0 && !searchTerm && (
              <div className="p-6 sm:p-10 text-center text-slate-500 dark:text-slate-400 min-h-[200px] sm:min-h-[300px] flex flex-col justify-center items-center">
                <Icon icon="ph:package-duotone" className="text-5xl sm:text-6xl mb-3 opacity-70"/>
                <p className="text-lg sm:text-xl">Tidak ada data yang diterima.</p>
                <p className="text-sm sm:text-base">API mengembalikan daftar kosong atau ada masalah saat memprosesnya.</p>
              </div>
            )}

            {!loading && !error && filteredFolders.length > 0 && (
              <SimpleBar className="max-h-[calc(100vh-300px)]">
                <div className="p-4 sm:p-6 space-y-4">
                  {filteredFolders.map((folder) => (
                    <Disclosure key={folder._id} as="div" defaultOpen={false}
                        className="bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm hover:shadow-lg transition-shadow duration-200">
                      {({ open }) => (
                        <>
                          <Disclosure.Button className={`flex justify-between items-center w-full px-4 py-3 sm:px-5 sm:py-3.5 text-left rounded-t-xl group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-opacity-75
                            hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors duration-150
                            ${open ? 'bg-slate-200 dark:bg-slate-700/80 rounded-b-none' : ''}`}>
                            <div className="flex items-center min-w-0">
                              <Icon icon={open ? "ph:folder-open-duotone" : "ph:folder-duotone"} className="w-5 h-5 sm:w-6 sm:h-6 mr-2.5 sm:mr-3 text-teal-500 dark:text-teal-400 transition-transform duration-200 group-hover:scale-105" />
                              <span className="font-semibold text-sm sm:text-base text-teal-700 dark:text-teal-200 truncate flex-grow" title={folder.name}>{folder.name}</span>
                              <span className="ml-2 text-xs sm:text-sm px-2 py-0.5 sm:py-1 bg-teal-100 dark:bg-teal-700/60 text-teal-600 dark:text-teal-300 rounded-full">
                                {folder.contents?.length || 0} item
                              </span>
                            </div>
                            <div className="flex items-center">
                                <span className="text-xs text-slate-500 dark:text-slate-400 mr-2 hidden md:block">
                                    Dibuat: {formatDate(folder.createdAt).split(',')[0]}
                                </span>
                                <Icon
                                    icon="ph:caret-down-bold"
                                    className={`${open ? "transform rotate-180" : ""} w-4 h-4 sm:w-5 sm:h-5 text-teal-500 dark:text-teal-400 transition-transform`}
                                />
                            </div>
                          </Disclosure.Button>
                          <Transition
                            as={Fragment}
                            enter="transition ease-out duration-150"
                            enterFrom="opacity-0 -translate-y-2"
                            enterTo="opacity-100 translate-y-0"
                            leave="transition ease-in duration-100"
                            leaveFrom="opacity-100 translate-y-0"
                            leaveTo="opacity-0 -translate-y-2"
                          >
                            <Disclosure.Panel className="px-4 pt-2 pb-4 sm:px-5 sm:pb-5 text-sm dark:text-slate-300 bg-white dark:bg-slate-800/30 rounded-b-xl border-t border-slate-200 dark:border-slate-700/60">
                              {folder.contents && folder.contents.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                                  {folder.contents.map((content, contentIdx) => (
                                    <div key={`${folder._id}-${contentIdx}`} className="bg-slate-50 dark:bg-slate-700/70 p-3 sm:p-4 rounded-lg border border-slate-200 dark:border-slate-600/80 shadow hover:shadow-md transition-shadow duration-150 flex flex-col justify-between">
                                      <div>
                                        <h4 className="font-semibold text-base sm:text-lg text-teal-800 dark:text-teal-200 mb-1 sm:mb-1.5 truncate" title={content.title}>{content.title || "Tanpa Judul"}</h4>
                                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mb-2 sm:mb-3 line-clamp-3" title={content.description}>{content.description || "Tidak ada deskripsi."}</p>

                                        <div className="text-xs sm:text-sm space-y-1 mb-2 sm:mb-3 text-slate-700 dark:text-slate-300">
                                            <p><strong>Penulis:</strong> <span className="text-slate-500 dark:text-slate-400">{content.author || "N/A"}</span></p>
                                            <div className="flex items-center">
                                                <strong>Sandi:</strong>&nbsp;
                                                {content.password && content.password !== "-" ? (
                                                    <>
                                                    <span className={`ml-1 font-mono text-slate-500 dark:text-slate-400 ${showPassword[`${folder._id}-${contentIdx}`] ? '' : 'blur-sm select-none transition-all'}`}>
                                                        {content.password}
                                                    </span>
                                                    <button onClick={() => toggleShowPassword(folder._id, contentIdx)} className="ml-1.5 sm:ml-2 p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600 rounded">
                                                        <Icon icon={showPassword[`${folder._id}-${contentIdx}`] ? "ph:eye-slash-duotone" : "ph:eye-duotone"} className="text-sm sm:text-base text-teal-600 dark:text-teal-400"/>
                                                    </button>
                                                    </>
                                                ) : (
                                                    <span className="ml-1 text-slate-400 dark:text-slate-500">-</span>
                                                )}
                                            </div>
                                            <p><strong>Dibuat:</strong> <span className="text-slate-500 dark:text-slate-400">{formatDate(content.createdAt)}</span></p>
                                        </div>
                                      </div>

                                      {content.link && content.link !== "-" && (
                                        <a
                                          href={content.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 inline-flex items-center justify-center text-xs sm:text-sm bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-medium py-1.5 px-3 sm:py-2 sm:px-3.5 rounded-md transition-all duration-150 w-full group shadow hover:shadow-md"
                                        >
                                          Kunjungi Tautan <Icon icon="ph:arrow-square-out-bold" className="ml-1.5 w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-0.5 transition-transform"/>
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-center py-3 text-slate-500 dark:text-slate-400">Tidak ada konten di folder ini.</p>
                              )}
                            </Disclosure.Panel>
                          </Transition>
                        </>
                      )}
                    </Disclosure>
                  ))}
                </div>
              </SimpleBar>
            )}
          </>
        )}

        {/* Submit Request Tab */}
        {activeTab === "submit" && (
          <div className="p-4 sm:p-6">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Submit Request ke NBScript
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Kirim request untuk menambahkan website atau script baru ke NBScript database.
                </p>
              </div>

              <form onSubmit={handleSubmitRequest} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Nama <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none transition-shadow"
                    placeholder="Masukkan nama Anda"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none transition-shadow"
                    placeholder="email@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Website <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={formData.website}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none transition-shadow"
                    placeholder="https://example.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Deskripsi <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 outline-none transition-shadow"
                    placeholder="Jelaskan tentang website atau script yang ingin Anda submit..."
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitLoading}
                    className={`px-6 py-2 rounded-md font-medium transition-colors duration-150 ${
                      submitLoading
                        ? "bg-slate-400 text-slate-200 cursor-not-allowed"
                        : "bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow hover:shadow-md"
                    }`}
                  >
                    {submitLoading ? (
                      <>
                        <Icon icon="svg-spinners:blocks-shuffle-3" className="inline mr-2" />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        <Icon icon="ph:paper-plane-duotone" className="inline mr-2" />
                        Kirim Request
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DbDataPage;