<%data_path="../"
session("hgc")=Replace_Text(Request("hgc"))
%>

<!-- #include File="../conn/conn.asp" -->
<!-- #include File="class_upfile.asp" --> 
<!-- #include File="safe.asp" -->
<!-- #include File="filesystem.asp" -->
<!-- #include File="uppicconfig.asp" -->
   <html>
	<head>
	<meta http-equiv="Content-Type" content="text/html; charset=gb2312" />
	<title> 文件上传</title>
	<style type="text/css">
<!--
/* 全局 */
div,ul,ol,form {margin:0;padding:0;}
input {font-family:Arial,Helvetica,sans-serif;font-size:12px;height:20px;}

body {
text-align: center;
margin:0;
font-family:Arial,Helvetica,sans-serif;
font-size: 12px;
line-height: 150%;
word-break:break-all;
}
-->
</style>
	</head>
	<body>
	
 <%

  '允许会员和管理员上传
   if request.Cookies("globalecmaster")<>"" or request.Cookies("masterflag")<>""  or request.Cookies("adminid")<>"" then
  
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	 
		if Fy_In=1 then
 
	
    '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			guser=Replace_Text(Request("guser"))
   			utype=Replace_Text(Request("utype"))
   			if utype="prod" then                              '产品图片
   				upload_dir="../UploadFile/produppic/"  
   			elseif utype="news" then
   				upload_dir="../UploadFile/Newsuppic/"           '新闻图片
   			   
   			end if
   
     '是否允许多次上传^^^^^^^^^^^^^^^^^^^
     		istwo=Replace_Text(Request("istwo"))
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
	'返回的值处理^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    		tMode=Replace_Text(Request("tMode"))

			
	'^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  			If Replace_Text(Request("t"))="1" Then
				Upfile_Main()
   			Else
 				Main()
  			End If
%>
			
  
<%
Sub Main()

	Dim PostRanNum,PostRan22
	Randomize
	PostRanNum = Int(9000*rnd)+1000
 %>
	<ul style="margin:0px;text-align: left;width:100%;"> 
     <form name="myform" method="post" action="upload2.asp?t=1&tMode=<%=tMode%>&istwo=0&utype=<%=utype%>&guser=<%=guser%>" enctype="multipart/form-data">
	
	 <INPUT TYPE="hidden" NAME="UploadCode" value="<%=PostRanNum%>">
	 <input type="hidden" name="act" value="upload">
 	 <input type="file" name="uploadfile">
	 <input type="hidden" name="fname">
	 <input type="submit" name="Ok" value="上传" ><br />
      </form>
	</ul>
</body>
</html>
<% End Sub%>
   
   
   
<%
   Sub Upfile_Main()	
%>
<ul style="margin:0px;text-align: left;width:100%;"> 
<%
response.write session("hgc")
 UploadFile
%>
</ul>
</body>
</html>
<%

  End Sub
  
  Sub UploadFile()
       	Server.ScriptTimeOut=9999999
 	Dim Upload,FilePath,FormName,File,F_FileName,F_Viewname
    upfiletype=replace(upfiletype,"|",",")
        FilePath=upload_dir
   	Set Upload = New UpFile_Cls
 		Upload.UploadType			= 0										'设置上传组件类型
 		Upload.UploadPath			= FilePath								'设置上传路径
		Upload.MaxSize				= maxsize				                '单位 KB
		Upload.InceptMaxFile		= 8										'每次上传文件个数上限
		Upload.InceptFileType		= upfiletype							'设置上传文件限制
		Upload.RName				= ""
		Upload.ChkSessionName		= "UploadCode"
 		'执行上传
		Upload.SaveUpFile
		If Upload.ErrCodes<>0 Then
 			Response.write "错误："& Upload.Description & "[ <a href='upload2.asp?tMode="&tMode&"&istwo=1&utype="&utype&"&guser="&guser&"'>重新上传</a> ]"
			Exit Sub
		End If
		If Upload.Count > 0 Then
			For Each FormName In Upload.UploadFiles
				Set File = Upload.UploadFiles(FormName)
				F_FileName = FilePath & File.FileName
  					if re<>"no" then
						select case file.filetype
						case 1
							If tMode="1" Then
 								Response.Write "<script>parent.form.picture.value='aboutuppic/" & File.FileName & "';</script>"
 							ElseIf  tMode="2" Then 
						 	Response.Write "<script>parent.form.picture.value='"& File.FileName&"';</script>"

							ElseIf  tMode="3" Then 
						 	Response.Write "<script>parent.form.picture.value='/UploadFile/produppic/"& File.FileName&"';</script>"

						
							
							End If
 						end select
					else
 					end if


					Response.Write "小图上传成功!  "&hgc
					response.write "<script>parent.form.magicfacepic1.value='/UploadFile/produppic/"&File.FileName&"'</script>"

				Set File = Nothing
			Next
		Else
			Response.write "请正确选择要上传的文件。[ <a href='upload2.asp?tMode=" & tMode &"'>重新上传</a> ]"
			Exit Sub
		End If
	Set Upload = Nothing
 End Sub
 
 else
  %>
  对不起！尚为开通上传功能！
  <%
 end if
 else
    response.write "<script language='javascript'>"
    response.write"this.location.href='../index.html';</SCRIPT>" 
    response.end
  end if
 %>