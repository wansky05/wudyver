"use client";

import SimpleBar from "simplebar-react";
import { useState, useEffect } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Textinput from "@/components/ui/Textinput";
import { ToastContainer, toast } from "react-toastify";
import { Icon } from '@iconify/react';

const ShortLinkPage = () => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    url: "",
    name: ""
  });
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
    fetchShortLinks();
  }, []);

  const fetchShortLinks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/shortlinks');
      const result = await response.json();
      
      if (result.success) {
        setLinks(result.data);
      } else {
        toast.error("Gagal mengambil data shortlink");
      }
    } catch (error) {
      console.error("Fetch Error:", error);
      toast.error("Terjadi kesalahan saat mengambil data");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.url) {
      toast.warn("URL tidak boleh kosong!");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/shortlinks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Shortlink berhasil dibuat!");
        setFormData({ url: "", name: "" });
        fetchShortLinks();
      } else {
        toast.error(result.message || "Gagal membuat shortlink");
      }
    } catch (error) {
      console.error("Submit Error:", error);
      toast.error("Terjadi kesalahan saat membuat shortlink");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success("Link disalin ke clipboard!");
      })
      .catch(() => {
        toast.error("Gagal menyalin link");
      });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <>
      <div className="w-full px-2 sm:px-4 py-6">
        <ToastContainer
          position="top-right"
          autoClose={3000}
          newestOnTop
          theme="colored"
          toastClassName={(options) =>
            `relative flex p-1 min-h-10 rounded-md justify-between overflow-hidden cursor-pointer
            ${options?.type === 'success' ? 'bg-emerald-500 text-white' :
              options?.type === 'error' ? 'bg-red-500 text-white' :
              options?.type === 'warn' ? 'bg-yellow-500 text-white' :
              'bg-sky-500 text-white'} dark:text-slate-100 text-sm p-3 m-2 rounded-lg shadow-md`
          }
        />
        
        <Card
          bodyClass="relative p-0 h-full overflow-hidden"
          className="w-full mb-6 border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white text-slate-800 dark:bg-slate-800/50 dark:text-slate-100 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80"
        >
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
            <div className="flex flex-col sm:flex-row items-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md mb-2 sm:mb-0">
                <Icon icon="ph:link-simple-horizontal-duotone" className="text-2xl sm:text-3xl" />
              </div>
              <h1 className="ml-0 sm:ml-4 text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500 text-center sm:text-left">
                Buat Shortlink Baru
              </h1>
            </div>
            <p className="text-sm text-center sm:text-left text-slate-500 dark:text-slate-400 mt-2 ml-0 sm:ml-[calc(2.5rem+1rem)] md:ml-[calc(3rem+1rem)]">
              Persingkat URL Anda dengan mudah dan cepat.
            </p>
          </div>

          <div className="p-4 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <label htmlFor="url" className="block text-sm sm:text-base font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                  <Icon icon="ph:link-duotone" className="mr-2 text-xl" />
                  URL Tujuan
                </label>
                <Textinput
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://example.com/url-yang-sangat-panjang-dan-rumit"
                  value={formData.url}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-700/80 border-slate-300 dark:border-slate-600/80 text-slate-900 dark:text-slate-200 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm"
                  inputClassName="text-sm bg-transparent placeholder-slate-400 dark:placeholder-slate-500 p-3"
                />
              </div>

              <div className="bg-slate-100/70 dark:bg-slate-800/40 p-4 sm:p-5 rounded-lg border border-slate-200 dark:border-slate-700/60">
                <label htmlFor="name" className="block text-sm sm:text-base font-medium text-teal-700 dark:text-teal-300 mb-2 flex items-center">
                  <Icon icon="ph:text-aa-duotone" className="mr-2 text-xl" />
                  Custom Short ID (Opsional)
                </label>
                <Textinput
                  id="name"
                  name="name"
                  type="text"
                  placeholder="contoh: produk-terbaru"
                  value={formData.name}
                  onChange={handleInputChange}
                  disabled={loading}
                  className="w-full bg-white dark:bg-slate-700/80 border-slate-300 dark:border-slate-600/80 text-slate-900 dark:text-slate-200 rounded-md focus:ring-1 focus:ring-teal-500 focus:border-teal-500 text-sm"
                  inputClassName="text-sm bg-transparent placeholder-slate-400 dark:placeholder-slate-500 p-3"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Jika dikosongkan, akan dibuatkan ID acak secara otomatis
                </p>
              </div>

              <Button
                text={
                  loading ? (
                    <span className="flex items-center justify-center">
                      <Icon icon="svg-spinners:ring-resize" className="animate-spin mr-2 text-lg" /> Processing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center">
                      <Icon icon="ph:plus-circle-duotone" className="mr-1.5 text-lg" />
                      Buat Shortlink
                    </span>
                  )
                }
                className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white font-semibold rounded-md shadow-md hover:shadow-lg transition duration-300 py-2.5 text-sm flex items-center justify-center disabled:opacity-70"
                disabled={loading || !formData.url}
                type="submit"
              />
            </form>
          </div>
        </Card>

        <Card
          bodyClass="relative p-0 h-full overflow-hidden"
          className="w-full border border-teal-500/50 dark:border-teal-600/70 rounded-xl shadow-lg bg-white text-slate-800 dark:bg-slate-800/50 dark:text-slate-100 backdrop-blur-sm bg-opacity-80 dark:bg-opacity-80"
        >
          <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700/60">
            <div className="flex flex-col sm:flex-row items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-md mb-2 sm:mb-0">
                  <Icon icon="ph:list-bullets-duotone" className="text-2xl sm:text-3xl" />
                </div>
                <h1 className="ml-0 sm:ml-4 text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-cyan-500 text-center sm:text-left">
                  Daftar Shortlink
                </h1>
              </div>
              <Button
                text="Refresh"
                icon="ph:arrow-clockwise-duotone"
                className="mt-2 sm:mt-0 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                onClick={fetchShortLinks}
                disabled={loading}
              />
            </div>
            <p className="text-sm text-center sm:text-left text-slate-500 dark:text-slate-400 mt-2 ml-0 sm:ml-[calc(2.5rem+1rem)] md:ml-[calc(3rem+1rem)]">
              Semua shortlink yang telah Anda buat
            </p>
          </div>

          <SimpleBar className="max-h-[calc(100vh-230px)]">
            <div className="p-4 sm:p-6">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <Icon icon="svg-spinners:blocks-shuffle-3" className="text-4xl text-teal-500 mb-3" />
                  <p className="text-sm text-slate-600 dark:text-teal-300">
                    Memuat data shortlink...
                  </p>
                </div>
              ) : links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Icon icon="ph:link-simple-break-duotone" className="text-4xl text-slate-400 mb-3" />
                  <p className="text-slate-500 dark:text-slate-400">Belum ada shortlink yang dibuat</p>
                  <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Buat shortlink pertama Anda di atas</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {links.map((link) => (
                    <div key={link._id} className="bg-slate-100/70 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center mb-1">
                            <span className="font-medium text-teal-600 dark:text-teal-400 truncate">
                              {origin}/s/{link.id}
                            </span>
                            <Button
                              icon="ph:copy-duotone"
                              className="ml-2 p-1.5 text-slate-500 hover:text-teal-500 dark:text-slate-400 dark:hover:text-teal-300"
                              onClick={() => copyToClipboard(`${origin}/s/${link.id}`)}
                            />
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mb-2">
                            → {link.url}
                          </div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">
                            Dibuat: {formatDate(link.createdAt)}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            icon="ph:eye-duotone"
                            className="bg-teal-100 hover:bg-teal-200 dark:bg-teal-800/30 dark:hover:bg-teal-700/40 text-teal-600 dark:text-teal-300"
                            onClick={() => window.open(`${origin}/s/${link.id}`, '_blank')}
                          />
                          <Button
                            icon="ph:trash-duotone"
                            className="bg-red-100 hover:bg-red-200 dark:bg-red-800/30 dark:hover:bg-red-700/40 text-red-600 dark:text-red-300"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SimpleBar>
        </Card>
      </div>
    </>
  );
};

export default ShortLinkPage;